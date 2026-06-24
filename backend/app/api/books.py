"""Book endpoints: catalog (list/CRUD) + Этап 2 (PDF & cover upload/download)."""

import logging
from typing import Literal

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select, func, or_, desc, asc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession


from app.api.deps import get_current_admin, get_current_user, get_current_user_optional, get_approved_user
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


@router.get("/{book_id}/also-read", response_model=list[BookPublic])
async def also_read(
    book_id: int,
    limit: int = 8,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[BookPublic]:
    """Collaborative filtering: «люди, читающие эту книгу, также читают…».

    Находим пользователей, у которых эта книга в списке, и собираем другие
    книги из их списков, ранжируя по частоте пересечений.
    """
    from app.models.library import MyListEntry

    # Пользователи, у которых текущая книга в mylist
    user_ids_subq = (
        select(MyListEntry.user_id)
        .where(MyListEntry.book_id == book_id)
        .subquery()
    )

    # Другие книги этих пользователей, ранжированные по количеству пользователей
    freq_q = (
        select(MyListEntry.book_id, func.count(MyListEntry.user_id).label("cnt"))
        .where(
            MyListEntry.user_id.in_(select(user_ids_subq)),
            MyListEntry.book_id != book_id,
        )
        .group_by(MyListEntry.book_id)
        .order_by(desc("cnt"))
        .limit(limit)
    )
    rows = (await db.execute(freq_q)).all()
    book_ids = [r[0] for r in rows]

    if not book_ids:
        return []

    books = (
        await db.scalars(
            select(Book).options(selectinload(Book.categories)).where(Book.id.in_(book_ids))
        )
    ).all()
    # сохраняем порядок по частоте
    order = {bid: i for i, bid in enumerate(book_ids)}
    books_sorted = sorted(books, key=lambda b: order.get(b.id, 999))
    return [_to_public(b) for b in books_sorted]


# ---- E4: обязательные книги для подразделения ----
from pydantic import BaseModel as _BaseModel  # noqa: E402


class RequiredBookSet(_BaseModel):
    department: str | None = None  # None — снять обязательность


class RequiredBookBrief(_BaseModel):
    id: int
    title: str
    author: str
    required_for_department: str | None = None


@router.post("/{book_id}/required", response_model=RequiredBookBrief)
async def set_required(
    book_id: int,
    payload: RequiredBookSet,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> RequiredBookBrief:
    """Admin only: пометить книгу обязательной для подразделения (или снять)."""
    book = await _get_book_or_404(db, book_id)
    book.required_for_department = (payload.department or None)
    await db.commit()
    await db.refresh(book)
    return RequiredBookBrief(
        id=book.id, title=book.title, author=book.author,
        required_for_department=book.required_for_department,
    )


@router.get("/required/mine", response_model=list[RequiredBookBrief])
async def my_required_books(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[RequiredBookBrief]:
    """Книги, обязательные для подразделения текущего пользователя."""
    if not current.department:
        return []
    rows = (
        await db.scalars(
            select(Book).where(Book.required_for_department == current.department)
        )
    ).all()
    return [
        RequiredBookBrief(
            id=b.id, title=b.title, author=b.author,
            required_for_department=b.required_for_department,
        )
        for b in rows
    ]



@router.post("", response_model=BookPublic, status_code=status.HTTP_201_CREATED)
async def create_book(
    payload: BookCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> BookPublic:
    """Admin only: create a new book record."""
    from app.services.admin_audit import log_admin_action

    # Распаковываем без поля categories — оно обрабатывается отдельно
    data = payload.model_dump(exclude={"categories"})
    book = Book(**data)
    
    # Создаём/находим категории и привязываем
    if payload.categories:
        book.categories = await _get_or_create_categories(db, payload.categories)
    
    db.add(book)
    await db.commit()
    await db.refresh(book)
    await log_admin_action(db, admin, "book_create", target=f"book:{book.id}", detail=f"Создана книга «{book.title}»")
    await db.commit()
    return _to_public(book)


@router.patch("/{book_id}", response_model=BookPublic)
async def update_book(
    book_id: int,
    payload: BookUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> BookPublic:
    """Admin only: update book fields."""
    from app.services.admin_audit import log_admin_action

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
    await log_admin_action(db, admin, "book_update", target=f"book:{book.id}", detail=f"Изменена книга «{book.title}»")
    await db.commit()
    return _to_public(book)


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_book(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
    storage: StorageBackend = Depends(get_storage),
) -> None:
    """Admin only: delete a book and all related records (cascade) + связанные файлы."""
    from app.services.admin_audit import log_admin_action

    book = await _get_book_or_404(db, book_id)
    book_title = book.title

    # Запоминаем ключи до коммита БД.
    pdf_key = book.pdf_storage_key
    cover_key = book.cover_storage_key

    await db.delete(book)
    await db.commit()
    await log_admin_action(db, admin, "book_delete", target=f"book:{book_id}", detail=f"Удалена книга «{book_title}»")
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


# ============================================================================
# Полнотекстовый поиск: индексация содержимого книг (H)
# ============================================================================


async def _read_storage_bytes(storage, key: str) -> bytes:
    """Прочитать весь файл из storage в память (для индексации)."""
    chunks = await storage.open_stream(key)
    buf = bytearray()
    async for chunk in chunks:
        buf.extend(chunk)
    return bytes(buf)


@router.post("/{book_id}/reindex")
async def reindex_book(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
    storage: StorageBackend = Depends(get_storage),
) -> dict:
    """Admin only: переиндексировать текст книги для полнотекстового поиска."""
    from app.services.search_index import index_book_content

    book = await _get_book_or_404(db, book_id)
    if not book.pdf_storage_key:
        raise HTTPException(status_code=400, detail="У книги нет PDF для индексации")

    try:
        data = await _read_storage_bytes(storage, book.pdf_storage_key)
    except StorageNotFound:
        raise HTTPException(status_code=404, detail="PDF-файл не найден в хранилище") from None

    pages = await index_book_content(db, book_id, data)
    return {"book_id": book_id, "indexed_pages": pages}


@router.post("/reindex-all")
async def reindex_all_books(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
    storage: StorageBackend = Depends(get_storage),
) -> dict:
    """Admin only: проиндексировать текст всех книг с PDF (для поиска и сертификации).

    Выполняется синхронно по всем книгам. На большом каталоге может занять время.
    """
    from app.services.search_index import index_book_content

    books = (await db.scalars(select(Book).where(Book.pdf_storage_key.isnot(None)))).all()
    total = len(books)
    indexed_books = 0
    indexed_pages = 0
    failed = 0

    for book in books:
        if not book.pdf_storage_key:
            continue
        try:
            data = await _read_storage_bytes(storage, book.pdf_storage_key)
            pages = await index_book_content(db, book.id, data)
            indexed_pages += pages
            indexed_books += 1
        except Exception as e:  # noqa: BLE001
            logger.warning("Не удалось проиндексировать книгу %s: %s", book.id, e)
            failed += 1
            continue

    return {
        "total_books": total,
        "indexed_books": indexed_books,
        "indexed_pages": indexed_pages,
        "failed": failed,
    }


class MatchArTopicsRequest(_BaseModel):
    topics: list[str]


@router.post("/ai-match-ar-topics")
async def ai_match_ar_topics(
    payload: MatchArTopicsRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> dict:
    """Admin only: ИИ сопоставляет книги с темами AR-схем и добавляет книгам
    соответствующие категории, чтобы книги появлялись в рекомендациях AR-режима."""
    from app.services.deepseek_client import chat_completion, DeepSeekError
    import json as _json

    topics = [t.strip() for t in payload.topics if t and t.strip()]
    if not topics:
        raise HTTPException(status_code=400, detail="Список тем пуст")

    books = (await db.scalars(select(Book))).all()
    if not books:
        return {"updated": 0, "total": 0}

    updated = 0
    processed = 0
    # Обрабатываем партиями по 15 книг, чтобы уложиться в лимиты модели
    batch = 15
    topics_list = "\n".join(f"- {t}" for t in topics)

    for i in range(0, len(books), batch):
        chunk = books[i:i + batch]
        books_desc = []
        for b in chunk:
            cats = ", ".join(c.name for c in b.categories) if b.categories else "нет"
            desc = (b.description or "")[:300]
            books_desc.append(f'ID {b.id}: "{b.title}" | категории: {cats} | описание: {desc}')
        books_block = "\n".join(books_desc)

        prompt = (
            "Есть список тем кибербезопасности (темы AR-схем):\n"
            f"{topics_list}\n\n"
            "И список книг:\n"
            f"{books_block}\n\n"
            "Для каждой книги определи, к каким из перечисленных тем она относится "
            "(0, 1 или несколько — только из списка тем, точные формулировки). "
            "Верни СТРОГО JSON без markdown:\n"
            '{"matches":[{"id":123,"topics":["Тема1","Тема2"]}]}'
        )
        try:
            raw = await chat_completion(
                [{"role": "user", "content": prompt}],
                system_prompt="Ты классифицируешь книги по темам. Отвечаешь строго JSON.",
                max_tokens=2000,
                timeout=120.0,
            )
        except DeepSeekError:
            continue

        t = raw.strip()
        if t.startswith("```"):
            t = t.strip("`")
            if t.startswith("json"):
                t = t[4:]
        s, e = t.find("{"), t.rfind("}")
        if s == -1 or e == -1:
            continue
        try:
            data = _json.loads(t[s:e + 1])
            matches = data.get("matches", [])
        except (ValueError, TypeError):
            continue

        by_id = {b.id: b for b in chunk}
        for m in matches:
            try:
                bid = int(m["id"])
                matched_topics = [str(x).strip() for x in m.get("topics", [])]
            except (KeyError, TypeError, ValueError):
                continue
            # оставляем только валидные темы из списка
            matched_topics = [t for t in matched_topics if t in topics]
            if not matched_topics:
                continue
            book = by_id.get(bid)
            if not book:
                continue
            existing_names = {c.name for c in book.categories}
            new_names = [t for t in matched_topics if t not in existing_names]
            if new_names:
                added = await _get_or_create_categories(db, list(existing_names) + matched_topics)
                book.categories = added
                updated += 1
        processed += len(chunk)
        await db.commit()

    return {"updated": updated, "total": len(books)}


@router.get("/reindex/status")
async def reindex_status(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> dict:
    """Admin only: сколько книг проиндексировано (есть текст в BookPage)."""
    from app.models.book_page import BookPage

    total = await db.scalar(select(func.count()).select_from(Book).where(Book.pdf_storage_key.isnot(None)))
    indexed = await db.scalar(
        select(func.count(func.distinct(BookPage.book_id)))
    )
    return {"total_books": total or 0, "indexed_books": indexed or 0}



@router.get("/{book_id}/pdf")
async def download_book_pdf(
    book_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_approved_user),
    storage: StorageBackend = Depends(get_storage),
):
    """Любой авторизованный: скачать/прочитать PDF книги. Поддерживает HTTP Range
    (частичная загрузка) — pdf.js грузит файл по кускам, большие книги открываются быстро."""
    book = await _get_book_or_404(db, book_id)
    if not book.pdf_storage_key:
        raise HTTPException(status_code=404, detail="Book has no PDF attached")

    try:
        size = await storage.size(book.pdf_storage_key)
    except StorageNotFound:
        logger.error(
            "Storage object missing for book %s (key=%s)",
            book_id, book.pdf_storage_key,
        )
        raise HTTPException(status_code=404, detail="PDF file is missing") from None

    # Имя файла для Content-Disposition (безопасное ASCII).
    safe_title = "".join(c if c.isascii() and c not in '\\/:*?"<>|' else "_" for c in book.title)
    filename_ascii = f"{safe_title or 'book'}.pdf"

    # --- Быстрая отдача через nginx (X-Accel-Redirect) ---
    # Python только проверил права; тяжёлую передачу файла берёт на себя nginx —
    # он отдаёт файл напрямую с диска с поддержкой Range. Работает для локального хранилища.
    from app.core.config import settings as _settings
    local_path = getattr(_settings, "STORAGE_LOCAL_PATH", None)
    storage_backend = getattr(_settings, "STORAGE_BACKEND", "local")
    if storage_backend == "local" and local_path:
        # ключ хранения вида books/pdf/<file>.pdf -> internal location /_protected_pdf/
        accel_path = "/_protected_pdf/" + book.pdf_storage_key.lstrip("/")
        headers = {
            "X-Accel-Redirect": accel_path,
            "Content-Type": "application/pdf",
            "Content-Disposition": f'inline; filename="{filename_ascii}"',
            "Accept-Ranges": "bytes",
        }
        return Response(status_code=200, headers=headers)

    range_header = request.headers.get("range") or request.headers.get("Range")

    # --- Частичный запрос (Range) ---
    if range_header and range_header.startswith("bytes="):
        try:
            rng = range_header.split("=", 1)[1].split(",")[0].strip()
            start_s, end_s = rng.split("-", 1)
            start = int(start_s) if start_s else 0
            end = int(end_s) if end_s else size - 1
            if start < 0 or end >= size or start > end:
                raise ValueError
        except (ValueError, IndexError):
            # Некорректный диапазон — 416
            return Response(
                status_code=416,
                headers={"Content-Range": f"bytes */{size}"},
            )

        chunks = await storage.open_range(book.pdf_storage_key, start, end)
        headers = {
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(end - start + 1),
            "Content-Disposition": f'inline; filename="{filename_ascii}"',
            "Cache-Control": "private, max-age=0, no-cache",
        }
        return StreamingResponse(
            chunks, status_code=206, media_type="application/pdf", headers=headers
        )

    # --- Полный файл (без Range) ---
    try:
        chunks = await storage.open_stream(book.pdf_storage_key)
    except StorageNotFound:
        raise HTTPException(status_code=404, detail="PDF file is missing") from None

    # Счётчик скачиваний инкрементим только на полной отдаче (не на каждый range-кусок).
    if current.role.value != "admin":
        book.downloads += 1
        await db.commit()

    headers = {
        "Content-Length": str(size),
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{filename_ascii}"',
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
    """Admin only: загрузить обложку книги. Изображение сжимается (макс. 800px, JPEG)."""
    book = await _get_book_or_404(db, book_id)

    head = await file.read(_MAGIC_HEAD_BYTES)
    try:
        ext = detect_cover_ext(head, declared_mime=file.content_type)
    except FileValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None

    # читаем весь файл (обложки небольшие; лимит MAX_COVER_SIZE_BYTES)
    rest = await file.read(settings.MAX_COVER_SIZE_BYTES + 1)
    raw = head + rest
    if len(raw) > settings.MAX_COVER_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Обложка слишком большая")

    # сжимаем через Pillow: ресайз до 800px по большей стороне, JPEG q=85
    try:
        from io import BytesIO
        from PIL import Image

        img = Image.open(BytesIO(raw))
        img = img.convert("RGB")
        max_side = 800
        if max(img.size) > max_side:
            ratio = max_side / max(img.size)
            new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            img = img.resize(new_size, Image.LANCZOS)
        out = BytesIO()
        img.save(out, format="JPEG", quality=85, optimize=True)
        compressed = out.getvalue()
        save_ext = ".jpg"
    except Exception:  # noqa: BLE001 — если Pillow недоступен/ошибка, сохраняем оригинал
        logger.exception("Сжатие обложки не удалось, сохраняю оригинал (book %s)", book_id)
        compressed = raw
        save_ext = ext

    old_key = book.cover_storage_key
    new_key = StorageBackend.make_key("books/cover", save_ext)

    async def _one_chunk():
        yield compressed

    try:
        size = await storage.save_stream(
            new_key,
            _one_chunk(),
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

    # MIME выводим из расширения ключа — оно проставлено при загрузке.
    ext_to_mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    media_type = "application/octet-stream"
    for ext, mime in ext_to_mime.items():
        if key.endswith(ext):
            media_type = mime
            break

    # --- Быстрая отдача через nginx (X-Accel-Redirect) ---
    # Обложек на странице много (десятки одновременных запросов). Если стримить
    # их через Python, воркеры захлёбываются и соединения рвутся (ERR_CONNECTION_RESET).
    # nginx отдаёт файлы напрямую с диска, не нагружая backend.
    from app.core.config import settings as _settings
    local_path = getattr(_settings, "STORAGE_LOCAL_PATH", None)
    storage_backend = getattr(_settings, "STORAGE_BACKEND", "local")
    if storage_backend == "local" and local_path:
        accel_path = "/_protected_pdf/" + key.lstrip("/")
        return Response(status_code=200, headers={
            "X-Accel-Redirect": accel_path,
            "Content-Type": media_type,
            "Cache-Control": "public, max-age=86400",
        })

    try:
        size = await storage.size(key)
        chunks = await storage.open_stream(key)
    except StorageNotFound:
        logger.error("Cover missing for book %s (key=%s)", book_id, key)
        raise HTTPException(status_code=404, detail="Cover file is missing") from None

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


# ============================================================================
# Журнал действий администратора (audit log)
# ============================================================================


@router.get("/admin/logs")
async def get_admin_logs(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> list[dict]:
    """Admin only: последние действия администраторов.

    Путь /books/admin/logs — 'admin' не парсится как int book_id, поэтому
    конфликта с GET /books/{book_id} нет (book_id объявлен с типом int).
    """
    from app.models.admin_log import AdminLog

    rows = (
        await db.scalars(
            select(AdminLog).order_by(AdminLog.created_at.desc()).limit(limit)
        )
    ).all()
    return [
        {
            "id": r.id,
            "admin": r.admin_username,
            "action": r.action,
            "target": r.target,
            "detail": r.detail,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]