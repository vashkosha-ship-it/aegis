"""Full-text search endpoints — поиск по метаданным и содержимому книг (H)."""
import logging
import re

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.book import Book
from app.models.user import User
from app.schemas.search import SearchHit, SearchHitPage, SearchResponse
from app.services import books as books_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/search", tags=["search"])

# Сколько совпавших страниц ранжируем при поиске по тексту книг.
CONTENT_CANDIDATES = 2000


@router.get("", response_model=SearchResponse)
async def search_books(
    q: str = Query(..., min_length=2, max_length=200, description="Поисковый запрос"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> SearchResponse:
    """Полнотекстовый поиск по названию/автору/описанию и содержимому книг.

    Использует PostgreSQL tsvector с русской конфигурацией и ранжирование.
    websearch_to_tsquery безопасно парсит пользовательский ввод.
    """
    query = q.strip()

    # --- 1. Поиск по метаданным книг ---
    # Поиск идёт по мере набора, поэтому «PyTo» должно находить «PyTorch»:
    # кроме полнотекстового совпадения учитываем начало слов (prefix-запрос)
    # и подстроку в названии или авторе. Название весит больше всего.
    words = re.findall(r"[^\W_]+", query.lower())
    prefix_q = " & ".join(f"{w}:*" for w in words[:8]) if words else ""
    like = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    meta_sql = text(
        "SELECT id, title, author, cover_storage_key, file_format, "
        "ts_rank(search_vector, websearch_to_tsquery('russian', :q)) "
        "  + CASE WHEN :pq <> '' AND search_vector @@ to_tsquery('simple', :pq) THEN 0.2 ELSE 0 END "
        "  + CASE WHEN title ILIKE :like THEN 1.0 ELSE 0 END "
        "  + CASE WHEN author ILIKE :like THEN 0.5 ELSE 0 END AS rank "
        "FROM books "
        "WHERE search_vector @@ websearch_to_tsquery('russian', :q) "
        "   OR (:pq <> '' AND search_vector @@ to_tsquery('simple', :pq)) "
        "   OR title ILIKE :like OR author ILIKE :like "
        "ORDER BY rank DESC, id "
        "LIMIT :lim"
    )
    meta_rows = (await db.execute(
        meta_sql, {"q": query, "pq": prefix_q, "like": like, "lim": limit},
    )).mappings().all()

    hits: dict[int, SearchHit] = {}
    for r in meta_rows:
        hits[r["id"]] = SearchHit(
            book_id=r["id"], title=r["title"], author=r["author"],
            has_cover=bool(r["cover_storage_key"]),
            file_format=r["file_format"] or "pdf",
            rank=float(r["rank"] or 0), matched_in="meta", pages=[],
        )

    # --- 2. Поиск по содержимому страниц ---
    # Частое слово («ИИ», «данные») встречается на десятках тысяч страниц, и
    # ранжировать каждую — секунды на запрос при поиске по мере набора.
    # Поэтому сначала по GIN-индексу берём ограниченный набор кандидатов, затем
    # ранжируем только их, а фрагмент с подсветкой строим лишь для итоговых
    # страниц. На выдаче (до 20 книг по 3 страницы) это не сказывается.
    content_sql = text(
        "WITH q AS (SELECT websearch_to_tsquery('russian', :q) AS tsq), "
        "cand AS ("
        "  SELECT bp.id, bp.search_vector FROM book_pages bp, q "
        "  WHERE bp.search_vector @@ q.tsq LIMIT :cap"
        "), "
        "ranked AS ("
        "  SELECT cand.id, ts_rank(cand.search_vector, q.tsq) AS rank FROM cand, q "
        "  ORDER BY rank DESC LIMIT :lim"
        ") "
        "SELECT bp.book_id, bp.page, r.rank, "
        "ts_headline('russian', bp.content, q.tsq, "
        "  'MaxWords=18, MinWords=6, ShortWord=2, MaxFragments=1, StartSel=<b>, StopSel=</b>') AS snippet "
        "FROM ranked r JOIN book_pages bp ON bp.id = r.id, q "
        "ORDER BY r.rank DESC"
    )
    content_rows = (await db.execute(
        content_sql, {"q": query, "lim": limit * 3, "cap": CONTENT_CANDIDATES},
    )).mappings().all()

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
                file_format=b.file_format or "pdf",
                rank=float(r["rank"] or 0), matched_in="content", pages=[],
            )
            hits[bid] = hit
        if len(hit.pages) < 3:
            hit.pages.append(SearchHitPage(page=r["page"], snippet=r["snippet"] or ""))
        hit.rank = max(hit.rank, float(r["rank"] or 0))

    if not books_service.is_admin(current):
        # Книги, которые нельзя открыть, читателю не показываем и в поиске.
        hidden = await books_service.hidden_book_ids(db)
        for book_id in hidden & hits.keys():
            del hits[book_id]
    result = sorted(hits.values(), key=lambda h: h.rank, reverse=True)[:limit]
    return SearchResponse(query=query, total=len(result), hits=result)
