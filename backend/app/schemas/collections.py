"""Схемы пользовательских подборок книг."""
from pydantic import BaseModel, Field


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
    # book_ids дублирует books намеренно: фронту нужен быстрый способ
    # проверить принадлежность книги к подборке без обхода объектов.
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
