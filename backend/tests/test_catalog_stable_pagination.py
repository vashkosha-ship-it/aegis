"""Каталог: при одинаковой популярности страницы не теряют и не дублируют книги."""
from __future__ import annotations

from app.models.book import Book
from tests.conftest import auth_headers


async def test_pages_cover_every_book_once(client, db, approved_user):
    db.add_all([
        Book(title=f"Книга {i}", author="Автор", description="", popularity=0)
        for i in range(25)
    ])
    await db.commit()

    seen: list[int] = []
    for page in (1, 2, 3):
        r = await client.get(
            f"/books?page={page}&per_page=10", headers=auth_headers(approved_user)
        )
        assert r.status_code == 200, r.text
        seen.extend(item["id"] for item in r.json()["items"])
    assert len(seen) == 25
    assert len(set(seen)) == 25
