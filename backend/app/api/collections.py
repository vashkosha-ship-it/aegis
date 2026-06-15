"""Custom collections endpoints — пользовательские подборки книг (#9)."""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.book import Book
from app.models.collection import Collection, collection_books
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/me/collections", tags=["collections"])


# ---- Schemas ----------------------------------------------------------------
class CollectionBookBrief(BaseModel):
    id: int
    title: str
    author: str

    class Config:
        from_attributes = True


class CollectionPublic(BaseModel):
    id: int
    name: str
    icon: str
    book_ids: list[int] = Field(default_factory=list)
    books: list[CollectionBookBrief] = Field(default_factory=list)

    class Config:
        from_attributes = True


class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    icon: str = Field(default="📁", max_length=8)


class CollectionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    icon: str | None = Field(default=None, max_length=8)


def _to_public(c: Collection) -> CollectionPublic:
    return CollectionPublic(
        id=c.id,
        name=c.name,
        icon=c.icon,
        book_ids=[b.id for b in c.books],
        books=[CollectionBookBrief(id=b.id, title=b.title, author=b.author) for b in c.books],
    )


async def _get_owned(db: AsyncSession, user: User, collection_id: int) -> Collection:
    c = (
        await db.scalars(
            select(Collection)
            .options(selectinload(Collection.books))
            .where(Collection.id == collection_id, Collection.user_id == user.id)
        )
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    return c


# ---- Endpoints --------------------------------------------------------------
@router.get("", response_model=list[CollectionPublic])
async def list_collections(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[CollectionPublic]:
    rows = (
        await db.scalars(
            select(Collection)
            .options(selectinload(Collection.books))
            .where(Collection.user_id == current.id)
            .order_by(Collection.created_at)
        )
    ).all()
    return [_to_public(c) for c in rows]


@router.post("", response_model=CollectionPublic, status_code=status.HTTP_201_CREATED)
async def create_collection(
    payload: CollectionCreate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> CollectionPublic:
    # запрет дубля имени
    exists = await db.scalar(
        select(Collection).where(
            Collection.user_id == current.id, Collection.name == payload.name.strip()
        )
    )
    if exists:
        raise HTTPException(status_code=400, detail="Коллекция с таким именем уже существует")

    c = Collection(user_id=current.id, name=payload.name.strip(), icon=payload.icon or "📁")
    db.add(c)
    await db.commit()
    await db.refresh(c, ["books"])
    return _to_public(c)


@router.patch("/{collection_id}", response_model=CollectionPublic)
async def update_collection(
    collection_id: int,
    payload: CollectionUpdate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> CollectionPublic:
    c = await _get_owned(db, current, collection_id)
    if payload.name is not None:
        c.name = payload.name.strip()
    if payload.icon is not None:
        c.icon = payload.icon
    await db.commit()
    await db.refresh(c, ["books"])
    return _to_public(c)


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(
    collection_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> None:
    c = await _get_owned(db, current, collection_id)
    await db.delete(c)
    await db.commit()


@router.put("/{collection_id}/books/{book_id}", response_model=CollectionPublic)
async def add_book(
    collection_id: int,
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> CollectionPublic:
    c = await _get_owned(db, current, collection_id)
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if book.id not in [b.id for b in c.books]:
        c.books.append(book)
        await db.commit()
        await db.refresh(c, ["books"])
    return _to_public(c)


@router.delete("/{collection_id}/books/{book_id}", response_model=CollectionPublic)
async def remove_book(
    collection_id: int,
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> CollectionPublic:
    c = await _get_owned(db, current, collection_id)
    c.books = [b for b in c.books if b.id != book_id]
    await db.commit()
    await db.refresh(c, ["books"])
    return _to_public(c)
