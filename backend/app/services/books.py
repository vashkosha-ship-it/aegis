"""Бизнес-логика работы с книгами.

Отделено от роутера намеренно: эти функции не знают про HTTP и вызываются
не только из API, но и из фонового воркера (индексация). Поэтому вместо
HTTPException они бросают свои исключения, а роутер переводит их в коды
ответов.
"""
from __future__ import annotations

import hashlib
import logging
import posixpath
from collections.abc import AsyncIterator
from urllib.parse import quote

from sqlalchemy import func as sqlfunc
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book, Category
from app.schemas.book import BookPublic

logger = logging.getLogger(__name__)


class BookServiceError(Exception):
    """Базовая ошибка сервиса книг."""


class BookNotFound(BookServiceError):
    """Книги с таким id нет."""


class InvalidStorageKey(BookServiceError):
    """Ключ хранения выглядит небезопасно — вероятно, повреждены данные."""


# ---------------------------------------------------------------------------
# Хранилище
# ---------------------------------------------------------------------------


def accel_path_for_key(key: str) -> str:
    """Собрать безопасный путь для X-Accel-Redirect.

    Ключ хранения приходит из БД. Если в нём окажется '..' или ведущий слэш,
    nginx выйдет за пределы каталога storage и отдаст произвольный файл сервера.
    Разрешаем только «плоские» относительные пути и URL-экранируем сегменты.
    """
    raw = key.replace("\\", "/")
    # Абсолютный путь в ключе — признак битых данных: молча превращать его в
    # относительный опасно, лучше отказать.
    if raw.startswith("/"):
        logger.error("Suspicious storage key rejected for X-Accel: %r", key)
        raise InvalidStorageKey(key)

    normalized = posixpath.normpath(raw)
    if normalized.startswith("..") or normalized.startswith("/") or normalized == ".":
        logger.error("Suspicious storage key rejected for X-Accel: %r", key)
        raise InvalidStorageKey(key)

    return "/_protected_pdf/" + quote(normalized)


async def stream_upload_remainder(
    upload,
    head: bytes,
    chunk_size: int = 1024 * 1024,
) -> AsyncIterator[bytes]:
    """Отдать сначала уже прочитанную «голову» файла, затем остаток.

    Голову читают заранее для проверки magic-bytes; чтобы не держать файл
    целиком в памяти, дальше он передаётся в хранилище потоком.
    """
    if head:
        yield head
    while True:
        chunk = await upload.read(chunk_size)
        if not chunk:
            break
        yield chunk


async def read_storage_bytes(storage, key: str) -> bytes:
    """Собрать файл из хранилища в память.

    Использовать с осторожностью: на книгах в сотни мегабайт это съедает
    столько же RAM. Для индексации есть потоковый путь в search_index.
    """
    chunks = await storage.open_stream(key)
    buf = bytearray()
    async for chunk in chunks:
        buf.extend(chunk)
    return bytes(buf)


# ---------------------------------------------------------------------------
# Каталог
# ---------------------------------------------------------------------------


async def get_book_or_raise(db: AsyncSession, book_id: int) -> Book:
    """Найти книгу или бросить BookNotFound."""
    book = await db.get(Book, book_id)
    if not book:
        raise BookNotFound(book_id)
    return book


async def get_or_create_categories(db: AsyncSession, names: list[str]) -> list[Category]:
    """Получить (или создать) категории по именам.

    Регистронезависимая дедупликация: «AppSec» и «appsec» — одна категория.
    """
    if not names:
        return []

    result: list[Category] = []
    for name in names:
        clean = name.strip()
        if not clean:
            continue

        existing = (
            await db.execute(
                select(Category).where(sqlfunc.lower(Category.name) == clean.lower())
            )
        ).scalar_one_or_none()

        if existing:
            result.append(existing)
        else:
            cat = Category(name=clean)
            db.add(cat)
            await db.flush()  # нужен id для последующих связей
            result.append(cat)

    return result


def file_version(book: Book) -> str | None:
    """Короткий отпечаток текущего файла книги для кэша на устройстве.

    Ключ хранения новый при каждой загрузке файла, поэтому отпечаток меняется
    вместе с файлом. Сам ключ наружу не отдаём — только хеш от него.
    """
    key = book.epub_storage_key if book.file_format == "epub" else book.pdf_storage_key
    key = key or book.pdf_storage_key or book.epub_storage_key
    if not key:
        return None
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]


def to_public(book: Book) -> BookPublic:
    """ORM-модель → схема ответа, с вычисляемыми флагами наличия файлов."""
    return BookPublic(
        id=book.id,
        title=book.title,
        author=book.author,
        categories=[c.name for c in book.categories],
        description=book.description,
        icon=book.icon,
        rating=book.rating,
        views=book.views,
        downloads=book.downloads,
        popularity=book.popularity,
        total_pages=book.total_pages,
        has_pdf=bool(book.pdf_storage_key),
        has_epub=bool(book.epub_storage_key),
        has_file=bool(book.pdf_storage_key or book.epub_storage_key),
        file_format=book.file_format,
        has_cover=bool(book.cover_storage_key),
        file_version=file_version(book),
        indexing_status=book.indexing_status,
        indexing_started_at=book.indexing_started_at,
        indexing_finished_at=book.indexing_finished_at,
        indexed_at=book.indexed_at,
        indexed_sections=book.indexed_sections,
        date_published=book.date_published,
        created_at=book.created_at,
    )


# ---------------------------------------------------------------------------
# Дубликаты
# ---------------------------------------------------------------------------


async def hash_stream(stream: AsyncIterator[bytes], hasher) -> AsyncIterator[bytes]:
    """Пропустить поток файла насквозь, попутно считая хеш.

    Файл при загрузке идёт в хранилище потоком — второй раз читать его ради
    хеша дорого, поэтому считаем на лету.
    """
    async for chunk in stream:
        hasher.update(chunk)
        yield chunk


def normalize_title(title: str) -> str:
    """Название для сравнения: без регистра, пунктуации и лишних пробелов."""
    cleaned = "".join(ch if ch.isalnum() else " " for ch in (title or "").lower())
    return " ".join(cleaned.replace("ё", "е").split())


async def find_book_by_hash(
    db: AsyncSession, sha256: str, *, exclude_id: int | None = None
) -> Book | None:
    """Книга с тем же файлом (по SHA-256), кроме ``exclude_id``."""
    if not sha256:
        return None
    stmt = select(Book).where(Book.file_sha256 == sha256).order_by(Book.id)
    if exclude_id is not None:
        stmt = stmt.where(Book.id != exclude_id)
    return (await db.scalars(stmt.limit(1))).first()


async def find_book_by_title(
    db: AsyncSession, title: str, *, exclude_id: int | None = None
) -> Book | None:
    """Книга с тем же названием (без учёта регистра, пунктуации и записи издания)."""
    from app.services.duplicates import title_key

    key = title_key(title)
    if not key.words:
        return None
    stmt = select(Book).order_by(Book.id)
    if exclude_id is not None:
        stmt = stmt.where(Book.id != exclude_id)
    for book in (await db.scalars(stmt)).all():
        if title_key(book.title).ident == key.ident:
            return book
    return None
