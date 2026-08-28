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

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.models.book_page import BookPage

logger = logging.getLogger(__name__)

# Сколько страниц накапливаем перед записью в БД. Компромисс между числом
# round-trip'ов и объёмом данных в памяти.
PAGE_BATCH_SIZE = 100

# Ограничение на страницу — защита от мусорных PDF с гигантским текстовым слоем
MAX_PAGE_CHARS = 20000

# Файлы загружают администраторы, но PDF всё равно недоверенный ввод: битый
# или специально собранный документ может занять воркер на часы. Ограничиваем
# и объём работы, и время.
MAX_PAGES_PER_BOOK = 5000
EXTRACT_TIMEOUT_SECONDS = 900  # 15 минут на книгу
MAX_PDF_BYTES = 500 * 1024 * 1024


class IndexingError(Exception):
    """Книгу не удалось проиндексировать."""


class PdfTooLarge(IndexingError):
    pass


class ExtractionTimeout(IndexingError):
    pass


class IndexWouldRegress(IndexingError):
    """Новый индекс пуст, а старый — нет. Замена уничтожила бы данные."""


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
    for page_no, page in enumerate(reader.pages, start=1):
        if page_no > MAX_PAGES_PER_BOOK:
            # Документ с десятками тысяч страниц почти наверняка сгенерирован
            # автоматически; индексировать его целиком нет смысла.
            break
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
    """Обёртка: запускает извлечение в одноразовом процессе, с таймаутом."""
    size = os.path.getsize(path)
    if size > MAX_PDF_BYTES:
        raise PdfTooLarge(f"{size} байт — больше допустимых {MAX_PDF_BYTES}")

    loop = asyncio.get_running_loop()
    # max_workers=1 + новый пул на каждую книгу = процесс гарантированно
    # завершается, освобождая всю память.
    pool = ProcessPoolExecutor(max_workers=1)
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(pool, _extract_pages_worker, path),
            timeout=EXTRACT_TIMEOUT_SECONDS,
        )
    except TimeoutError as e:
        raise ExtractionTimeout(
            f"извлечение текста заняло больше {EXTRACT_TIMEOUT_SECONDS} с"
        ) from e
    finally:
        # cancel_futures + kill: зависший процесс нужно снять принудительно,
        # иначе он продолжит жечь CPU уже после нашего таймаута.
        pool.shutdown(wait=False, cancel_futures=True)

        # _processes существует, но равен None, пока пул не запустил рабочие
        # процессы или уже их снял. getattr с умолчанием тут не спасает:
        # атрибут есть, просто пустой.
        processes = getattr(pool, "_processes", None) or {}
        for proc in list(processes.values()):
            try:
                if proc.is_alive():
                    proc.kill()
            except Exception:  # noqa: BLE001, S110 — процесс мог завершиться сам
                pass


async def count_indexed_pages(db: AsyncSession, book_id: int) -> int:
    """Сколько страниц книги сейчас в индексе."""
    return await db.scalar(
        select(func.count(BookPage.id)).where(BookPage.book_id == book_id)
    ) or 0


async def index_book_from_path(
    db: AsyncSession, book_id: int, pdf_path: str, *, force: bool = False
) -> int:
    """Проиндексировать PDF с диска. Возвращает число сохранённых страниц.

    Замена индекса выполняется одной транзакцией: удаление старых страниц и
    вставка новых либо происходят целиком, либо не происходят вовсе.

    Раньше удаление коммитилось отдельно, и каждая пачка страниц — тоже.
    Прерывание посередине (перезапуск воркера при деплое, обрыв соединения с
    базой, OOM) оставляло книгу с частью страниц: поиск формально работал, но
    находил не всё, и отличить такую книгу от нормально проиндексированной
    было нельзя. Теперь незавершённая индексация просто откатывается, и
    остаётся прежний индекс — он хотя бы полный.

    Заодно обновляем book.total_pages — сервер узнаёт реальное число страниц
    и может проверять прогресс чтения.

    force=True разрешает заменить непустой индекс пустым. По умолчанию это
    запрещено: см. IndexWouldRegress ниже.
    """
    # Извлекаем текст ДО того, как трогаем индекс. Если извлечение упадёт
    # (битый файл, таймаут, нехватка памяти), существующий индекс не пострадает.
    pages = await _extract_pages(pdf_path)

    if not pages:
        raise IndexingError(
            f"Книга {book_id}: из файла не извлечено ни одной страницы"
        )

    rows = [
        {"book_id": book_id, "page": page_no, "content": text}
        for page_no, text in enumerate(pages, start=1)
        if text.strip()
    ]
    total = len(pages)
    saved = len(rows)

    if not rows and not force:
        # Текста нет вовсе. Если раньше индекс был, замена уничтожила бы его
        # без всякой пользы — а причина (заменили файл на скан, сломался
        # шрифтовый слой) требует человеческого решения, а не молчаливой
        # потери данных.
        existing = await count_indexed_pages(db, book_id)
        if existing:
            raise IndexWouldRegress(
                f"Книга {book_id}: в новом тексте нет ни одной страницы, "
                f"а в индексе сейчас {existing}. Замена отменена. "
                f"Если это ожидаемо, вызовите с force=True."
            )

    try:
        # Одна транзакция на всю замену. Коммит — единственный, в самом конце.
        # synchronize_session=False: сверять условие с объектами, уже
        # загруженными в сессию, здесь не нужно — мы удаляем всё разом. А при
        # включённой сверке SQLAlchemy пытается подгрузить просроченные после
        # commit объекты прямо посреди удаления и падает на этом.
        await db.execute(
            delete(BookPage).where(BookPage.book_id == book_id),
            execution_options={"synchronize_session": False},
        )

        # Вставляем пачками: это про размер одного запроса, а не про
        # атомарность — транзакция всё равно общая. Core insert вместо ORM,
        # чтобы объекты не оседали в identity map сессии.
        for start in range(0, len(rows), PAGE_BATCH_SIZE):
            await db.execute(insert(BookPage), rows[start:start + PAGE_BATCH_SIZE])

        if total:
            await db.execute(
                update(Book).where(Book.id == book_id).values(total_pages=total)
            )

        await db.commit()
    except Exception:
        # Откат возвращает прежний индекс целиком — книга остаётся в том
        # состоянии, в каком была до попытки.
        await db.rollback()
        logger.exception("Книга %s: индексация не завершена, индекс не изменён", book_id)
        raise

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
