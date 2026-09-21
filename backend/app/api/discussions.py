"""Book discussions endpoints — комментарии к книгам с ответами."""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.rate_limit import comment_limiter
from app.db.session import get_db
from app.models.book import Book
from app.models.book_comment import BookComment
from app.models.user import User
from app.schemas.discussions import CommentAuthor, CommentCreate, CommentPublic

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/books", tags=["discussions"])


def _author(u: User, current: User) -> CommentAuthor:
    hidden = (
        u.profile_visibility == "private"
        and u.id != current.id
        and current.role.value != "admin"
    )
    return CommentAuthor(
        id=0 if hidden else u.id,
        username="Скрытый пользователь" if hidden else u.username,
        full_name=None if hidden else u.full_name,
        has_avatar=False if hidden else bool(u.avatar_url),
    )


def _to_public(c: BookComment, current: User) -> CommentPublic:
    is_admin = current.role.value == "admin"
    return CommentPublic(
        id=c.id,
        text=c.text,
        created_at=c.created_at.isoformat(),
        author=_author(c.user, current),
        can_delete=(c.user_id == current.id or is_admin),
        replies=[],
    )


# ---- Endpoints --------------------------------------------------------------
@router.get("/{book_id}/comments", response_model=list[CommentPublic])
async def list_comments(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[CommentPublic]:
    """Все комментарии книги деревом (корневые + ответы)."""
    rows = (
        await db.scalars(
            select(BookComment)
            .options(selectinload(BookComment.user))
            .where(BookComment.book_id == book_id)
            .order_by(BookComment.created_at)
        )
    ).all()

    # группируем: корневые и ответы
    roots: list[CommentPublic] = []
    by_id: dict[int, CommentPublic] = {}
    children: dict[int, list[CommentPublic]] = {}

    for c in rows:
        pub = _to_public(c, current)
        by_id[c.id] = pub
        if c.parent_id is None:
            roots.append(pub)
        else:
            children.setdefault(c.parent_id, []).append(pub)

    # привязываем ответы к корневым (1 уровень; ответ на ответ — к тому же корню)
    for parent_id, kids in children.items():
        parent = by_id.get(parent_id)
        if parent is not None:
            parent.replies.extend(kids)

    return roots


@router.post("/{book_id}/comments", response_model=CommentPublic, status_code=status.HTTP_201_CREATED)
async def add_comment(
    book_id: int,
    payload: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> CommentPublic:
    """Добавить комментарий или ответ (parent_id)."""
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Книга не найдена")

    parent_id = payload.parent_id
    if parent_id is not None:
        parent = await db.get(BookComment, parent_id)
        if not parent or parent.book_id != book_id:
            raise HTTPException(status_code=404, detail="Комментарий для ответа не найден")
        # дерево в 1 уровень: ответ на ответ привязываем к корневому
        if parent.parent_id is not None:
            parent_id = parent.parent_id

    # Проверка и запись выполняются одной Redis-командой: параллельные
    # запросы и разные gunicorn-воркеры не могут проскочить между ними.
    allowed, wait = await comment_limiter.try_acquire(current.id)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Слишком часто. Подождите {wait} сек перед следующим комментарием.",
        )

    c = BookComment(book_id=book_id, user_id=current.id, parent_id=parent_id, text=payload.text.strip())
    db.add(c)
    await db.commit()
    await db.refresh(c, ["user"])
    return _to_public(c, current)


@router.delete("/{book_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    book_id: int,
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> None:
    """Удалить свой комментарий (или любой, если админ). Ответы удаляются каскадно."""
    c = await db.get(BookComment, comment_id)
    if not c or c.book_id != book_id:
        raise HTTPException(status_code=404, detail="Комментарий не найден")

    is_admin = current.role.value == "admin"
    if c.user_id != current.id and not is_admin:
        raise HTTPException(status_code=403, detail="Можно удалять только свои комментарии")

    await db.delete(c)
    await db.commit()
