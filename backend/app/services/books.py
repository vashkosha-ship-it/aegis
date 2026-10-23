"""Бизнес-логика работы с книгами.

Отделено от роутера намеренно: эти функции не знают про HTTP и вызываются
не только из API, но и из фонового воркера (индексация). Поэтому вместо
HTTPException они бросают свои исключения, а роутер переводит их в коды
ответов.
"""
from __future__ import annotations

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
        indexing_status=book.indexing_status,
        indexing_started_at=book.indexing_started_at,
        indexing_finished_at=book.indexing_finished_at,
        indexed_at=book.indexed_at,
        indexed_sections=book.indexed_sections,
        date_published=book.date_published,
        created_at=book.created_at,
    )


# --- дубликаты ---------------------------------------------------------------

AUTHOR_PLACEHOLDERS = {"", "—", "-", "автор не указан"}


def normalize_book_text(value: str | None) -> str:
    """Название/автор без регистра, пунктуации, «ё» и лишних пробелов.

    «Компьютерные сети. Системный подход, 6-е издание» и
    «компьютерные сети системный подход 6е издание» дают одну строку.
    """
    import re

    text = (value or "").lower().replace("ё", "е")
    text = re.sub(r"[^\w]+", " ", text, flags=re.UNICODE).replace("_", " ")
    return " ".join(text.split())


def is_placeholder_author(author: str | None) -> bool:
    return (author or "").strip().lower() in AUTHOR_PLACEHOLDERS


async def find_duplicate_by_metadata(
    db: AsyncSession, title: str, author: str | None, exclude_id: int | None = None
) -> Book | None:
    """Книга с тем же названием и автором (или без известного автора)."""
    norm_title = normalize_book_text(title)
    if not norm_title:
        return None
    norm_author = normalize_book_text(author)
    placeholder = is_placeholder_author(author)
    # Предфильтр по началу названия, точное сравнение — после нормализации.
    prefix = norm_title.split(" ")[0]
    stmt = select(Book).where(sqlfunc.lower(Book.title).contains(prefix))
    if exclude_id is not None:
        stmt = stmt.where(Book.id != exclude_id)
    for candidate in (await db.scalars(stmt)).all():
        if normalize_book_text(candidate.title) != norm_title:
            continue
        if placeholder or is_placeholder_author(candidate.author):
            return candidate
        if normalize_book_text(candidate.author) == norm_author:
            return candidate
    return None


async def find_duplicate_by_hash(
    db: AsyncSession, sha256: str, exclude_id: int | None = None
) -> Book | None:
    stmt = select(Book).where(Book.file_sha256 == sha256)
    if exclude_id is not None:
        stmt = stmt.where(Book.id != exclude_id)
    return (await db.scalars(stmt.limit(1))).first()


class HashingStream:
    """Обёртка над потоком загрузки, считающая SHA-256 по ходу записи."""

    def __init__(self, chunks: AsyncIterator[bytes]):
        import hashlib

        self._chunks = chunks
        self._hash = hashlib.sha256()

    def __aiter__(self):
        return self._iterate()

    async def _iterate(self):
        async for chunk in self._chunks:
            self._hash.update(chunk)
            yield chunk

    @property
    def hexdigest(self) -> str:
        return self._hash.hexdigest()



async def delete_book_files(storage, keys: list[str | None], book_id: int) -> None:
    """Удалить файлы книги из хранилища после того, как запись удалена из БД."""
    for key in keys:
        if not key:
            continue
        try:
            await storage.delete(key)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to delete storage object %s for book %s", key, book_id)


def duplicate_key(book: Book) -> tuple[str, str]:
    """Ключ группировки дубликатов: нормализованные название и автор."""
    author = "" if is_placeholder_author(book.author) else normalize_book_text(book.author)
    return normalize_book_text(book.title), author


async def find_duplicate_groups(db: AsyncSession) -> list[list[Book]]:
    """Группы книг-дубликатов; в каждой первой идёт та, что остаётся.

    Дубликатом считается тот же файл (SHA-256) или то же название с тем же
    автором. Остаётся книга, которую больше читали, при равенстве — более
    ранняя: так не теряются прогресс и отзывы читателей.
    """
    books = list((await db.scalars(select(Book).order_by(Book.id))).all())
    parent = {b.id: b.id for b in books}

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    by_hash: dict[str, int] = {}
    by_title: dict[str, list[Book]] = {}
    for book in books:
        if book.file_sha256:
            if book.file_sha256 in by_hash:
                union(by_hash[book.file_sha256], book.id)
            else:
                by_hash[book.file_sha256] = book.id
        title, _ = duplicate_key(book)
        if title:
            by_title.setdefault(title, []).append(book)
    for same_title in by_title.values():
        for i, a in enumerate(same_title):
            for b in same_title[i + 1:]:
                _, author_a = duplicate_key(a)
                _, author_b = duplicate_key(b)
                if not author_a or not author_b or author_a == author_b:
                    union(a.id, b.id)

    groups: dict[int, list[Book]] = {}
    for book in books:
        groups.setdefault(find(book.id), []).append(book)
    result = []
    for group in groups.values():
        if len(group) > 1:
            group.sort(key=lambda b: (-(b.views or 0), b.id))
            result.append(group)
    return result
