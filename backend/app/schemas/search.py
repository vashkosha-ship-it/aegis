"""Схемы полнотекстового поиска."""
from pydantic import BaseModel, Field


class SearchHitPage(BaseModel):
    """Страница книги, где нашлось совпадение, с фрагментом текста."""

    page: int
    snippet: str


class SearchHit(BaseModel):
    book_id: int
    title: str
    author: str
    has_cover: bool = False
    rank: float = 0.0
    matched_in: str = "meta"  # 'meta' | 'content' | 'both'
    pages: list[SearchHitPage] = Field(default_factory=list)


class SearchResponse(BaseModel):
    query: str
    total: int
    hits: list[SearchHit]
