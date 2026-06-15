"""Full-text search endpoints — поиск по метаданным и содержимому книг (H)."""
import logging

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.book import Book
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/search", tags=["search"])


class SearchHitPage(BaseModel):
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


@router.get("", response_model=SearchResponse)
async def search_books(
    q: str = Query(..., min_length=2, max_length=200, description="Поисковый запрос"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SearchResponse:
    """Полнотекстовый поиск по названию/автору/описанию и содержимому книг.

    Использует PostgreSQL tsvector с русской конфигурацией и ранжирование.
    websearch_to_tsquery безопасно парсит пользовательский ввод.
    """
    query = q.strip()

    # --- 1. Поиск по метаданным книг ---
    meta_sql = text(
        "SELECT id, title, author, cover_storage_key, "
        "ts_rank(search_vector, websearch_to_tsquery('russian', :q)) AS rank "
        "FROM books "
        "WHERE search_vector @@ websearch_to_tsquery('russian', :q) "
        "ORDER BY rank DESC "
        "LIMIT :lim"
    )
    meta_rows = (await db.execute(meta_sql, {"q": query, "lim": limit})).mappings().all()

    hits: dict[int, SearchHit] = {}
    for r in meta_rows:
        hits[r["id"]] = SearchHit(
            book_id=r["id"], title=r["title"], author=r["author"],
            has_cover=bool(r["cover_storage_key"]),
            rank=float(r["rank"] or 0), matched_in="meta", pages=[],
        )

    # --- 2. Поиск по содержимому страниц ---
    content_sql = text(
        "SELECT bp.book_id, bp.page, "
        "ts_rank(bp.search_vector, websearch_to_tsquery('russian', :q)) AS rank, "
        "ts_headline('russian', bp.content, websearch_to_tsquery('russian', :q), "
        "  'MaxWords=18, MinWords=6, ShortWord=2, MaxFragments=1, StartSel=<b>, StopSel=</b>') AS snippet "
        "FROM book_pages bp "
        "WHERE bp.search_vector @@ websearch_to_tsquery('russian', :q) "
        "ORDER BY rank DESC "
        "LIMIT :lim"
    )
    content_rows = (await db.execute(content_sql, {"q": query, "lim": limit * 3})).mappings().all()

    # книги, найденные только по содержимому — подтянуть их title/author
    content_book_ids = {r["book_id"] for r in content_rows}
    missing_ids = content_book_ids - set(hits.keys())
    books_by_id = {}
    if missing_ids:
        rows = (await db.scalars(select(Book).where(Book.id.in_(missing_ids)))).all()
        books_by_id = {b.id: b for b in rows}

    for r in content_rows:
        bid = r["book_id"]
        if bid in hits:
            hit = hits[bid]
            if hit.matched_in == "meta":
                hit.matched_in = "both"
        else:
            b = books_by_id.get(bid)
            if not b:
                continue
            hit = SearchHit(
                book_id=b.id, title=b.title, author=b.author,
                has_cover=bool(b.cover_storage_key),
                rank=float(r["rank"] or 0), matched_in="content", pages=[],
            )
            hits[bid] = hit
        if len(hit.pages) < 3:
            hit.pages.append(SearchHitPage(page=r["page"], snippet=r["snippet"] or ""))
        hit.rank = max(hit.rank, float(r["rank"] or 0))

    result = sorted(hits.values(), key=lambda h: h.rank, reverse=True)[:limit]
    return SearchResponse(query=query, total=len(result), hits=result)
