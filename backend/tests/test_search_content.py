"""Поиск по тексту книг: кандидаты ограничены, выдача и подсветка на месте."""
from __future__ import annotations

from sqlalchemy import text

from app.api import search
from app.models.book import Book
from app.models.book_page import BookPage
from tests.conftest import auth_headers, make_user


async def _add_search_columns(db) -> None:
    """Тестовая схема строится без миграций — добавляем столбцы поиска как в
    d6f7a8b9c0e1_add_fulltext_search."""
    await db.execute(text(
        "ALTER TABLE book_pages ADD COLUMN IF NOT EXISTS search_vector tsvector "
        "GENERATED ALWAYS AS (to_tsvector('russian', coalesce(content, ''))) STORED"
    ))
    await db.execute(text(
        "ALTER TABLE books ADD COLUMN IF NOT EXISTS search_vector tsvector "
        "GENERATED ALWAYS AS ("
        "  setweight(to_tsvector('russian', coalesce(title, '')), 'A') || "
        "  setweight(to_tsvector('russian', coalesce(author, '')), 'B') || "
        "  setweight(to_tsvector('russian', coalesce(description, '')), 'C')"
        ") STORED"
    ))
    await db.commit()


async def test_content_search_finds_pages_and_snippets(client, db, monkeypatch):
    await _add_search_columns(db)
    user = await make_user(db, username="search_reader")
    book = Book(title="Сети и протоколы", author="Автор", file_format="pdf")
    other = Book(title="Другая книга", author="Автор", file_format="pdf")
    db.add_all([book, other])
    await db.flush()
    db.add_all([
        BookPage(book_id=book.id, page=1, content="Введение. Нейросеть обучается на данных."),
        BookPage(book_id=book.id, page=2, content="Про нейросеть снова: нейросеть и нейросеть."),
        BookPage(book_id=other.id, page=7, content="Здесь о шифровании, без нужного слова."),
    ])
    await db.commit()

    r = await client.get("/search", params={"q": "нейросеть"}, headers=auth_headers(user))
    assert r.status_code == 200, r.text
    hits = r.json()["hits"]
    assert [h["book_id"] for h in hits] == [book.id]
    pages = hits[0]["pages"]
    assert {p["page"] for p in pages} == {1, 2}
    assert pages[0]["page"] == 2  # где слово чаще — выше
    assert "<b>" in pages[0]["snippet"]

    # Кандидатов для ранжирования — не больше лимита (частые слова).
    monkeypatch.setattr(search, "CONTENT_CANDIDATES", 1)
    r = await client.get("/search", params={"q": "нейросеть"}, headers=auth_headers(user))
    assert len(r.json()["hits"][0]["pages"]) == 1
