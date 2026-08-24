"""Извлечение текста из PDF и индексация для полнотекстового поиска.

Использует pypdf (чистый Python, без системных зависимостей).

Про память: PDF читается с диска потоком, а не целиком в bytes. Книга на
150 МБ раньше полностью оседала в RAM каждого воркера — при паре параллельных
индексаций сервер уходил в своп. Теперь pypdf работает с файловым объектом и
держит в памяти только текущую страницу, а страницы пишутся в БД пачками.
"""
import asyncio
import logging
import os
import tempfile
from collections.abc import AsyncIterator
from concurrent.futures import ProcessPoolExecutor

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.models.book_page import BookPage

logger = logging.getLogger(__name__)

# Сколько страниц накапливаем перед записью в БД. Компромисс между числом
# round-trip'ов и объёмом данных в памяти.
PAGE_BATCH_SIZE = 100

# Ограничение на страницу — защита от мусорных PDF с гигантским текстовым слоем
MAX_PAGE_CHARS = 20000


async def spool_to_tempfile(chunks: AsyncIterator[bytes]) -> str:
    """Слить поток из хранилища во временный файл и вернуть путь.

    Нужен, потому что pypdf требует seek(), а поток из S3/локального хранилища
    последовательный. Временный файл живёт на диске, а не в памяти.
    """
    fd, path = tempfile.mkstemp(suffix=".pdf", prefix="aegis-index-")
    try:
        with os.fdopen(fd, "wb") as f:
            async for chunk in chunks:
                f.write(chunk)
    except Exception:
        os.unlink(path)
        raise
    return path


def _extract_pages_worker(path: str) -> list[str]:
    """Извлечь текст всех страниц. Выполняется в ОТДЕЛЬНОМ процессе.

    Так сделано по двум причинам:
      * pypdf строит в памяти карту объектов всего документа — на книге в
        150 МБ это сотни мегабайт, которые Python не отдаёт ОС обратно. При
        индексации подряд полусотни книг воркер доходил до OOM. Отдельный
        процесс умирает вместе со своей памятью.
      * extract_text() — синхронный CPU-bound код; в основном процессе он
        блокировал event loop воркера целиком.
    """
    from pypdf import PdfReader

    reader = PdfReader(path)
    out: list[str] = []
    for page in reader.pages:
        try:
            txt = page.extract_text() or ""
        except Exception:  # noqa: BLE001 — битая страница не должна ронять всю книгу
            txt = ""
        # PostgreSQL не принимает NUL-байт в text-колонке, а он встречается в
        # PDF с битой кодировкой шрифтов и роняет вставку целой книги.
        txt = txt.replace("\x00", "")
        out.append(" ".join(txt.split())[:MAX_PAGE_CHARS])
    return out


async def _extract_pages(path: str) -> list[str]:
    """Обёртка: запускает извлечение в одноразовом процессе."""
    loop = asyncio.get_running_loop()
    # max_workers=1 + новый пул на каждую книгу = процесс гарантированно
    # завершается, освобождая всю память.
    with ProcessPoolExecutor(max_workers=1) as pool:
        return await loop.run_in_executor(pool, _extract_pages_worker, path)


async def index_book_from_path(db: AsyncSession, book_id: int, pdf_path: str) -> int:
    """Проиндексировать PDF с диска. Возвращает число сохранённых страниц.

    Прежний индекс книги удаляется. Заодно обновляем book.total_pages —
    сервер узнаёт реальное число страниц и может проверять прогресс чтения.
    """
    await db.execute(delete(BookPage).where(BookPage.book_id == book_id))
    await db.commit()

    pages = await _extract_pages(pdf_path)

    saved = 0
    total = 0
    batch: list[BookPage] = []

    for page_no, text in enumerate(pages, start=1):
        total = page_no
        if not text.strip():
            continue
        batch.append(BookPage(book_id=book_id, page=page_no, content=text))
        if len(batch) >= PAGE_BATCH_SIZE:
            db.add_all(batch)
            await db.commit()
            saved += len(batch)
            batch = []

    if batch:
        db.add_all(batch)
        await db.commit()
        saved += len(batch)

    if total:
        await db.execute(
            update(Book).where(Book.id == book_id).values(total_pages=total)
        )
        await db.commit()

    if total and saved / total < 0.1:
        # Скан без текстового слоя: файл читается, но искать в нём нечего.
        # Отдельный уровень лога, чтобы такие книги было видно в мониторинге.
        logger.warning(
            "Книга %s: текстовый слой почти отсутствует (%d из %d страниц) — "
            "вероятно скан, поиск по книге работать не будет",
            book_id, saved, total,
        )
    else:
        logger.info(
            "Книга %s: проиндексировано %d страниц из %d", book_id, saved, total
        )
    return saved


async def index_book_content(db: AsyncSession, book_id: int, pdf_bytes: bytes) -> int:
    """Совместимость со старым вызовом: принимает байты.

    Оставлено для кода, который ещё передаёт содержимое в память. Новый путь —
    index_book_from_path, он не держит файл в RAM.
    """
    fd, path = tempfile.mkstemp(suffix=".pdf", prefix="aegis-index-")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(pdf_bytes)
        return await index_book_from_path(db, book_id, path)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


async def is_book_indexed(db: AsyncSession, book_id: int) -> bool:
    """Проверить, есть ли уже текстовый индекс у книги."""
    row = await db.scalar(select(BookPage.id).where(BookPage.book_id == book_id).limit(1))
    return row is not None
