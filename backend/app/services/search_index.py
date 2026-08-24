"""Извлечение текста из PDF и индексация для полнотекстового поиска.

Использует pypdf (чистый Python, без системных зависимостей).

Про память: PDF читается с диска потоком, а не целиком в bytes. Книга на
150 МБ раньше полностью оседала в RAM каждого воркера — при паре параллельных
индексаций сервер уходил в своп. Теперь pypdf работает с файловым объектом и
держит в памяти только текущую страницу, а страницы пишутся в БД пачками.
"""
import logging
import os
import tempfile
from collections.abc import AsyncIterator

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


def _iter_pdf_pages(path: str):
    """Генератор текста страниц. Держит в памяти одну страницу за раз."""
    try:
        from pypdf import PdfReader
    except ImportError:
        logger.error("pypdf не установлен. Выполните: pip install pypdf")
        raise

    reader = PdfReader(path)
    for page in reader.pages:
        try:
            txt = page.extract_text() or ""
        except Exception:  # noqa: BLE001 — битая страница не должна ронять всю книгу
            txt = ""
        yield " ".join(txt.split())[:MAX_PAGE_CHARS]


async def index_book_from_path(db: AsyncSession, book_id: int, pdf_path: str) -> int:
    """Проиндексировать PDF с диска. Возвращает число сохранённых страниц.

    Прежний индекс книги удаляется. Заодно обновляем book.total_pages —
    сервер узнаёт реальное число страниц и может проверять прогресс чтения.
    """
    await db.execute(delete(BookPage).where(BookPage.book_id == book_id))
    await db.commit()

    saved = 0
    total = 0
    batch: list[BookPage] = []

    for page_no, text in enumerate(_iter_pdf_pages(pdf_path), start=1):
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
