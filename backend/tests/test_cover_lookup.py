"""Поиск обложки по названию: Open Library → Google Books, сверка названия."""
from __future__ import annotations

from io import BytesIO

import httpx
import pytest
from PIL import Image

from app.models.book import Book
from app.models.user import UserRole
from app.services import cover_lookup
from tests.conftest import auth_headers, make_user


def _jpeg(width=300, height=450, color=(30, 90, 160)) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="JPEG", quality=90)
    return buf.getvalue()


@pytest.fixture
def catalogs(monkeypatch):
    """Подменённая сеть. state задаёт, что «вернут» каталоги."""
    state = {"ol_docs": [], "gb_items": [], "requests": [], "image": _jpeg()}

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        state["requests"].append(url)
        if url.startswith(cover_lookup.OPEN_LIBRARY_SEARCH):
            return httpx.Response(200, json={"docs": state["ol_docs"]})
        if url.startswith(cover_lookup.GOOGLE_BOOKS_SEARCH):
            return httpx.Response(200, json={"items": state["gb_items"]})
        if "covers.openlibrary.org" in url or "books.google" in url:
            return httpx.Response(200, content=state["image"], headers={"content-type": "image/jpeg"})
        return httpx.Response(404)

    real = httpx.AsyncClient

    def factory(**kwargs):
        return real(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(cover_lookup.httpx, "AsyncClient", factory)
    return state


def test_title_matching():
    m = cover_lookup.title_matches
    assert m("The C Programming Language, Second Edition", "The C Programming Language")
    assert m("Head First Git", "Head First Git: A Learner's Guide")
    assert not m("Head First Git", "Head First Python")
    assert not m("Алгоритмы", "Алгоритмы на Java")
    assert not m("Linux API. Исчерпывающее руководство", "Linux Kernel API")


def test_cover_validation():
    assert cover_lookup.valid_cover(_jpeg())
    assert not cover_lookup.valid_cover(_jpeg(100, 150))      # крошечная
    assert not cover_lookup.valid_cover(_jpeg(600, 300))      # не книжные пропорции
    assert not cover_lookup.valid_cover(b"<html>not image</html>" * 200)


async def test_open_library_skips_other_books(catalogs):
    catalogs["ol_docs"] = [
        {"title": "Head First Python", "cover_i": 1},
        {"title": "Head First Git", "cover_i": 2},
    ]
    found = await cover_lookup.lookup_cover("Head First Git", "Raju Gandhi")
    assert found and found.source == "Open Library"
    assert any("/b/id/2-L.jpg" in u for u in catalogs["requests"])
    assert not any("/b/id/1-L.jpg" in u for u in catalogs["requests"])


async def test_google_books_fallback_and_nothing(catalogs):
    catalogs["gb_items"] = [{"volumeInfo": {
        "title": "Хакинг API",
        "imageLinks": {"thumbnail": "http://books.google.com/books/content?id=x&zoom=1&edge=curl"},
    }}]
    found = await cover_lookup.lookup_cover("Хакинг API. Взлом программных интерфейсов веб-приложений", "Кори Болл")
    assert found and found.source == "Google Books"
    image_url = [u for u in catalogs["requests"] if "books.google" in u][0]
    assert image_url.startswith("https://") and "zoom=0" in image_url and "edge=curl" not in image_url

    catalogs["gb_items"] = []
    assert await cover_lookup.lookup_cover("Совсем другая книга", None) is None


async def test_lookup_endpoint_saves_cover(client, db, catalogs):
    admin = await make_user(db, username="cover_admin", role=UserRole.ADMIN)
    reader = await make_user(db, username="cover_reader")
    book = Book(title="The Mythical Man-Month: Essays on Software Engineering", author="Frederick Brooks", file_format="pdf")
    db.add(book)
    await db.commit()

    r = await client.post(f"/books/{book.id}/cover/lookup", headers=auth_headers(reader))
    assert r.status_code == 403

    r = await client.post(f"/books/{book.id}/cover/lookup", headers=auth_headers(admin))
    assert r.json() == {"found": False, "source": None}

    catalogs["ol_docs"] = [{"title": "The Mythical Man-month", "cover_i": 7}]
    r = await client.post(f"/books/{book.id}/cover/lookup", headers=auth_headers(admin))
    assert r.status_code == 200
    assert r.json() == {"found": True, "source": "Open Library"}
    await db.refresh(book)
    assert book.cover_storage_key
    from app.core.storage import get_storage

    storage = get_storage()
    data = b"".join([c async for c in await storage.open_stream(book.cover_storage_key)])
    assert data[:3] == b"\xff\xd8\xff"  # сохранена как JPEG
    r = await client.get(f"/books/{book.id}/cover", headers=auth_headers(reader))
    assert r.status_code == 200
