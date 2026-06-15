"""Book discussions endpoints — комментарии к книгам с ответами."""
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.book import Book
from app.models.book_comment import BookComment
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/books", tags=["discussions"])


# --- Простой in-memory rate-limit на создание комментариев ---
# Не более N комментариев за окно WINDOW секунд на пользователя.
import time as _time
from collections import defaultdict, deque

_COMMENT_MAX = 5          # макс. комментариев
_COMMENT_WINDOW = 60      # за 60 секунд
_comment_history: dict[int, deque] = defaultdict(deque)


def _check_comment_limit(user_id: int) -> tuple[bool, int]:
    """Возвращает (разрешено, сколько_секунд_ждать)."""
    now = _time.time()
    dq = _comment_history[user_id]
    # выкидываем старые отметки за пределами окна
    while dq and now - dq[0] > _COMMENT_WINDOW:
        dq.popleft()
    if len(dq) >= _COMMENT_MAX:
        wait = int(_COMMENT_WINDOW - (now - dq[0])) + 1
        return False, wait
    return True, 0


def _record_comment(user_id: int) -> None:
    _comment_history[user_id].append(_time.time())


# --- Простой in-memory rate-limit на создание комментариев ---
# {user_id: [timestamps]}. Не более N комментариев за окно WINDOW секунд.
_comment_times: dict[int, list[float]] = {}
_COMMENT_LIMIT = 5          # макс. комментариев
_COMMENT_WINDOW = 60        # за 60 секунд


def _check_comment_rate(user_id: int) -> tuple[bool, int]:
    """Возвращает (разрешено, сколько секунд ждать)."""
    now = time.time()
    times = [t for t in _comment_times.get(user_id, []) if now - t < _COMMENT_WINDOW]
    _comment_times[user_id] = times
    if len(times) >= _COMMENT_LIMIT:
        wait = int(_COMMENT_WINDOW - (now - times[0])) + 1
        return False, wait
    return True, 0


def _record_comment(user_id: int) -> None:
    _comment_times.setdefault(user_id, []).append(time.time())


# ---- Schemas ----------------------------------------------------------------
class CommentCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    parent_id: int | None = None


class CommentAuthor(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    has_avatar: bool = False


class CommentPublic(BaseModel):
    id: int
    text: str
    created_at: str
    author: CommentAuthor
    can_delete: bool = False
    replies: list["CommentPublic"] = Field(default_factory=list)


def _author(u: User) -> CommentAuthor:
    return CommentAuthor(
        id=u.id, username=u.username, full_name=u.full_name,
        has_avatar=bool(u.avatar_url),
    )


def _to_public(c: BookComment, current: User) -> CommentPublic:
    is_admin = current.role.value == "admin"
    return CommentPublic(
        id=c.id,
        text=c.text,
        created_at=c.created_at.isoformat(),
        author=_author(c.user),
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
    allowed, wait = _check_comment_limit(current.id)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Слишком часто. Подождите {wait} сек перед следующим комментарием.",
        )

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

    c = BookComment(book_id=book_id, user_id=current.id, parent_id=parent_id, text=payload.text.strip())
    db.add(c)
    await db.commit()
    await db.refresh(c, ["user"])
    _record_comment(current.id)
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