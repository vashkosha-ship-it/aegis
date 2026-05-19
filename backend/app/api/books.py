"""Book endpoints: catalog (list/CRUD) + Этап 2 (PDF & cover upload/download)."""

import logging
from typing import Literal

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, or_, desc, asc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession


from app.api.deps import get_current_admin, get_current_user, get_current_user_optional
from app.core.config import settings
from app.core.file_validation import (
    FileValidationError,
    detect_cover_ext,
    validate_pdf_head,
)
from app.core.storage import (
    StorageBackend,
    StorageError,
    StorageNotFound,
    get_storage,
)
from app.db.session import get_db
from app.models.book import Book, Category
from app.models.user import User
from app.schemas.book import (
    BookCreate,
    BookFileUploadResult,
    BookListResponse,
    BookPublic,
    BookUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/books", tags=["books"])


# --- helpers ---------------------------------------------------------------
 
async def _get_or_create_categories(db, names: list[str]) -> list:
    """Получает (или создаёт) категории по их именам.
    
    Регистронезависимая дедупликация: «AppSec» и «appsec» считаются одним и тем же.
    """
    from app.models.book import Category
    from sqlalchemy import select, func as sqlfunc
    
    if not names:
        return []
    
    result = []
    for name in names:
        clean = name.strip()
        if not clean:
            continue
        
        # Ищем категорию (регистронезависимо)
        existing = (await db.execute(
            select(Category).where(sqlfunc.lower(Category.name) == clean.lower())
        )).scalar_one_or_none()
        
        if existing:
            result.append(existing)
        else:
            cat = Category(name=clean)
            db.add(cat)
            await db.flush()  # чтобы получить id для последующих связей
            result.append(cat)
    
    return result

def _to_public(book: Book) -> BookPublic:
    """Convert ORM Book to BookPublic, computing has_pdf/has_cover flags."""
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
        has_cover=bool(book.cover_storage_key),
        date_published=book.date_published,
        created_at=book.created_at,
    )


async def _get_book_or_404(db: AsyncSession, book_id: int) -> Book:
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


# Размер «головы» файла, который читаем для magic-bytes проверки.
# 16 байт хватает на любой формат, что мы поддерживаем.
_MAGIC_HEAD_BYTES = 16


async def _stream_remainder(
    upload: UploadFile,
    head: bytes,
    chunk_size: int = 1024 * 1024,
):
    """Async-итератор, отдающий сначала уже прочитанную «голову», потом остаток UploadFile."""
    if head:
        yield head
    while True:
        chunk = await upload.read(chunk_size)
        if not chunk:
            break
        yield chunk


# --- catalog: list / get / create / update / delete -------------------------


@router.get("", response_model=BookListResponse)
async def list_books(
    db: AsyncSession = Depends(get_db),
    _: User | None = Depends(get_current_user_optional),
    q: str | None = Query(None, description="Search by title/author"),
     category: str | None = Query(None, description="Фильтр по имени категории"),
    sort: Literal["default", "rating", "title", "date_added", "date_published"] = "default",
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> BookListResponse:
    """List books with search, filter, sort, pagination. Public endpoint."""
    stmt = select(Book).options(selectinload(Book.categories))
    count_stmt = select(func.count(Book.id))

    if q:
        like = f"%{q}%"
        cond = or_(Book.title.ilike(like), Book.author.ilike(like))
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if category:
        # Join к категориям, фильтр по имени
         stmt = stmt.join(Book.categories).where(Category.name == category)
         count_stmt = count_stmt.join(Book.categories).where(Category.name == category)

    sort_map = {
        "rating": desc(Book.rating),
        "title": asc(Book.title),
        "date_added": desc(Book.created_at),
        "date_published": desc(Book.date_published),
        "default": desc(Book.popularity),
    }
    stmt = stmt.order_by(sort_map[sort])
    stmt = stmt.offset((page - 1) * per_page).limit(per_page)

    total = (await db.scalar(count_stmt)) or 0
    rows = (await db.scalars(stmt)).all()

    return BookListResponse(
        items=[_to_public(b) for b in rows],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{book_id}", response_model=BookPublic)
async def get_book(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current: User | None = Depends(get_current_user_optional),
) -> BookPublic:
    """Retrieve a book and increment view counter."""
    book = await _get_book_or_404(db, book_id)
    if current and current.role.value != "admin":
        book.views += 1
        await db.commit()
        await db.refresh(book)
    return _to_public(book)


@router.post("", response_model=BookPublic, status_code=status.HTTP_201_CREATED)
async def create_book(
    payload: BookCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> BookPublic:
    """Admin only: create a new book record."""
    # Распаковываем без поля categories — оно обрабатывается отдельно
    data = payload.model_dump(exclude={"categories"})
    book = Book(**data)
    
    # Создаём/находим категории и привязываем
    if payload.categories:
        book.categories = await _get_or_create_categories(db, payload.categories)
    
    db.add(book)
    await db.commit()
    await db.refresh(book)
    return _to_public(book)


@router.patch("/{book_id}", response_model=BookPublic)
async def update_book(
    book_id: int,
    payload: BookUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> BookPublic:
    """Admin only: update book fields."""
    book = await _get_book_or_404(db, book_id)
    
    update_data = payload.model_dump(exclude_unset=True)
    categories_update = update_data.pop("categories", None)
    
    # Обычные поля
    for field, value in update_data.items():
        setattr(book, field, value)
    
    # Если в payload передали categories — заменяем целиком
    if categories_update is not None:
        book.categories = await _get_or_create_categories(db, categories_update)
    
    await db.commit()
    await db.refresh(book)
    return _to_public(book)


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_book(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
    storage: StorageBackend = Depends(get_storage),
) -> None:
    """Admin only: delete a book and all related records (cascade) + связанные файлы."""
    book = await _get_book_or_404(db, book_id)

    # Запоминаем ключи до коммита БД.
    pdf_key = book.pdf_storage_key
    cover_key = book.cover_storage_key

    await db.delete(book)
    await db.commit()

    # Файлы чистим ПОСЛЕ успешного удаления из БД.
    # Если упадём здесь — останутся osiротевшие файлы, но запись в БД уже удалена.
    # Это лучше, чем обратный сценарий (файлов нет, а ссылка в БД жива).
    for key in (pdf_key, cover_key):
        if not key:
            continue
        try:
            await storage.delete(key)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to delete storage object %s for book %s", key, book_id)


@router.get("/categories/all", response_model=list[str])
async def list_categories(db: AsyncSession = Depends(get_db)) -> list[str]:
    """Список всех существующих категорий (для автодополнения)."""
    from app.models.book import Category
    from sqlalchemy import select
    
    rows = await db.execute(select(Category.name).order_by(Category.name))
    return [r[0] for r in rows.all()]


# ============================================================================
# Этап 2: PDF
# ============================================================================


@router.post(
    "/{book_id}/pdf",
    response_model=BookFileUploadResult,
    status_code=status.HTTP_200_OK,
)
async def upload_book_pdf(
    book_id: int,
    file: UploadFile = File(..., description="PDF file (application/pdf)"),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
    storage: StorageBackend = Depends(get_storage),
) -> BookFileUploadResult:
    """Admin only: загрузить PDF и привязать к книге. Заменяет старый файл, если был."""
    book = await _get_book_or_404(db, book_id)

    # 1) Magic-bytes проверка ДО записи. Читаем «голову», потом стримим остаток.
    head = await file.read(_MAGIC_HEAD_BYTES)
    try:
        validate_pdf_head(head, declared_mime=file.content_type)
    except FileValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None

    # 2) Готовим новый ключ. Старый запоминаем — удалим после успешной записи.
    old_key = book.pdf_storage_key
    new_key = StorageBackend.make_key("books/pdf", ".pdf")

    # 3) Пишем стримом с лимитом по размеру.
    try:
        size = await storage.save_stream(
            new_key,
            _stream_remainder(file, head),
            max_bytes=settings.MAX_PDF_SIZE_BYTES,
        )
    except StorageError as e:
        # Сюда попадаем при превышении лимита; save_stream уже подчистил .part-файл.
        raise HTTPException(status_code=413, detail=str(e)) from None

    # 4) Обновляем запись в БД.
    book.pdf_storage_key = new_key
    await db.commit()

    # 5) Чистим старый файл (если был). Логируем замену — как договорились.
    replaced = bool(old_key)
    if replaced:
        logger.info(
            "Admin %s replaced PDF for book %s: old_key=%s, new_key=%s, new_size=%d",
            admin.id, book_id, old_key, new_key, size,
        )
        try:
            await storage.delete(old_key)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to delete old PDF %s for book %s", old_key, book_id)
            # Не срываем запрос: новый файл уже привязан, старый — кандидат на ручную чистку.

    return BookFileUploadResult(
        book_id=book_id, kind="pdf", size_bytes=size, replaced=replaced
    )


@router.get("/{book_id}/pdf")
async def download_book_pdf(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
    storage: StorageBackend = Depends(get_storage),
) -> StreamingResponse:
    """Любой авторизованный: скачать/прочитать PDF книги."""
    book = await _get_book_or_404(db, book_id)
    if not book.pdf_storage_key:
        raise HTTPException(status_code=404, detail="Book has no PDF attached")

    try:
        size = await storage.size(book.pdf_storage_key)
        chunks = await storage.open_stream(book.pdf_storage_key)
    except StorageNotFound:
        # Ссылка в БД есть, файла нет — рассинхрон. Жалуемся в лог, юзеру 404.
        logger.error(
            "Storage object missing for book %s (key=%s)",
            book_id, book.pdf_storage_key,
        )
        raise HTTPException(status_code=404, detail="PDF file is missing") from None

    # Инкрементим счётчик скачиваний — только для не-админов, чтобы метрика была честной
    # (то же поведение, что у views в get_book).
    if current.role.value != "admin":
        book.downloads += 1
        await db.commit()

    # Имя файла для Content-Disposition. Делаем безопасное ASCII-имя, плюс UTF-8 fallback.
    safe_title = "".join(c if c.isascii() and c not in '\\/:*?"<>|' else "_" for c in book.title)
    filename_ascii = f"{safe_title or 'book'}.pdf"

    headers = {
        "Content-Length": str(size),
        # inline — чтобы pdf.js открыл прямо во вьюпорте, а не вызывал «Скачать»
        "Content-Disposition": f'inline; filename="{filename_ascii}"',
        # Запрещаем кэшировать публичным прокси — файл за авторизацией
        "Cache-Control": "private, max-age=0, no-cache",
    }
    return StreamingResponse(chunks, media_type="application/pdf", headers=headers)


@router.delete("/{book_id}/pdf", status_code=status.HTTP_204_NO_CONTENT)
async def delete_book_pdf(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
    storage: StorageBackend = Depends(get_storage),
) -> None:
    """Admin only: отвязать и удалить PDF у книги."""
    book = await _get_book_or_404(db, book_id)
    if not book.pdf_storage_key:
        # Идемпотентно: уже удалён — это не ошибка.
        return

    key = book.pdf_storage_key
    book.pdf_storage_key = None
    await db.commit()

    try:
        await storage.delete(key)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to delete PDF %s for book %s", key, book_id)

    logger.info("Admin %s deleted PDF for book %s (key=%s)", admin.id, book_id, key)


# ============================================================================
# Этап 2: обложки (JPEG/PNG/WEBP)
# ============================================================================


@router.post(
    "/{book_id}/cover",
    response_model=BookFileUploadResult,
    status_code=status.HTTP_200_OK,
)
async def upload_book_cover(
    book_id: int,
    file: UploadFile = File(..., description="Cover image (JPEG, PNG, WEBP)"),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
    storage: StorageBackend = Depends(get_storage),
) -> BookFileUploadResult:
    """Admin only: загрузить обложку книги."""
    book = await _get_book_or_404(db, book_id)

    head = await file.read(_MAGIC_HEAD_BYTES)
    try:
        ext = detect_cover_ext(head, declared_mime=file.content_type)
    except FileValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None

    old_key = book.cover_storage_key
    new_key = StorageBackend.make_key("books/cover", ext)

    try:
        size = await storage.save_stream(
            new_key,
            _stream_remainder(file, head),
            max_bytes=settings.MAX_COVER_SIZE_BYTES,
        )
    except StorageError as e:
        raise HTTPException(status_code=413, detail=str(e)) from None

    book.cover_storage_key = new_key
    await db.commit()

    replaced = bool(old_key)
    if replaced:
        logger.info(
            "Admin %s replaced cover for book %s: old_key=%s, new_key=%s",
            admin.id, book_id, old_key, new_key,
        )
        try:
            await storage.delete(old_key)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to delete old cover %s for book %s", old_key, book_id)

    return BookFileUploadResult(
        book_id=book_id, kind="cover", size_bytes=size, replaced=replaced
    )


@router.get("/{book_id}/cover")
async def download_book_cover(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    storage: StorageBackend = Depends(get_storage),
) -> StreamingResponse:
    """Публично: получить обложку книги. Используется в карточках на фронте."""
    book = await _get_book_or_404(db, book_id)
    if not book.cover_storage_key:
        raise HTTPException(status_code=404, detail="Book has no cover")

    key = book.cover_storage_key
    try:
        size = await storage.size(key)
        chunks = await storage.open_stream(key)
    except StorageNotFound:
        logger.error("Cover missing for book %s (key=%s)", book_id, key)
        raise HTTPException(status_code=404, detail="Cover file is missing") from None

    # MIME выводим из расширения ключа — оно проставлено при загрузке.
    ext_to_mime = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    media_type = "application/octet-stream"
    for ext, mime in ext_to_mime.items():
        if key.endswith(ext):
            media_type = mime
            break

    return StreamingResponse(
        chunks,
        media_type=media_type,
        headers={
            "Content-Length": str(size),
            # Обложки можно кэшировать — они не за авторизацией, и меняются редко
            "Cache-Control": "public, max-age=86400",
        },
    )


@router.delete("/{book_id}/cover", status_code=status.HTTP_204_NO_CONTENT)
async def delete_book_cover(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
    storage: StorageBackend = Depends(get_storage),
) -> None:
    """Admin only: удалить обложку книги. Идемпотентно."""
    book = await _get_book_or_404(db, book_id)
    if not book.cover_storage_key:
        return

    key = book.cover_storage_key
    book.cover_storage_key = None
    await db.commit()

    try:
        await storage.delete(key)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to delete cover %s for book %s", key, book_id)

    logger.info("Admin %s deleted cover for book %s (key=%s)", admin.id, book_id, key)
