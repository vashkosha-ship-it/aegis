"""Остановка массовой переиндексации."""
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.book import Book
from app.models.book_page import BookPage
from tests.conftest import auth_headers


async def _book(db, title, *, status, text):
    book = Book(title=title, author="А", description="", pdf_storage_key=f"books/pdf/{title}.pdf",
                indexing_status=status)
    db.add(book)
    await db.flush()
    if text:
        db.add(BookPage(book_id=book.id, page=1, content="текст"))
    await db.commit()
    return book.id


@pytest.mark.asyncio
async def test_stop_restores_indexed_books_and_keeps_new_ones_queued(client, db, admin_user):
    indexed = await _book(db, "already", status="queued", text=True)
    fresh = await _book(db, "fresh", status="queued", text=False)
    running = await _book(db, "running", status="running", text=True)

    response = await client.post("/books/reindex/stop", headers=auth_headers(admin_user))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["restored"] == 1
    assert body["still_queued"] == 1
    db.expire_all()
    statuses = dict((await db.execute(select(Book.id, Book.indexing_status))).all())
    assert statuses[indexed] == "succeeded"
    assert statuses[fresh] == "queued"
    assert statuses[running] == "running"   # текущую книгу не трогаем — доиндексируется


@pytest.mark.asyncio
async def test_stop_requires_admin(client, approved_user):
    response = await client.post("/books/reindex/stop", headers=auth_headers(approved_user))
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_bulk_indexing_skips_books_no_longer_queued(db, engine, monkeypatch):
    from app import worker

    done = await _book(db, "done", status="succeeded", text=True)
    todo = await _book(db, "todo", status="queued", text=False)
    indexed = []

    async def fake_index_one(book_id):
        indexed.append(book_id)
        return 1

    monkeypatch.setattr(worker, "_index_one", fake_index_one)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(worker, "AsyncSessionLocal", maker)

    result = await worker._index_all_books()

    assert todo in indexed and done not in indexed
    assert result["skipped"] >= 1
