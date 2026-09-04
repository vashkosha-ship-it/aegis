"""Индекс книги остаётся рабочим после неудачной переиндексации."""
from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.sql.dml import Insert

from app.models.book import Book
from app.models.book_page import BookPage
from app.services import search_index


async def _book_with_old_index(db):
    book = Book(
        title="Книга со старым индексом",
        author="Автор",
        description="",
        total_pages=2,
    )
    db.add(book)
    await db.flush()
    db.add_all([
        BookPage(book_id=book.id, page=1, content="старый текст один"),
        BookPage(book_id=book.id, page=2, content="старый текст два"),
    ])
    await db.commit()
    return book


async def test_extraction_failure_preserves_old_index(db, monkeypatch):
    book = await _book_with_old_index(db)

    async def fail_extraction(_path):
        raise search_index.IndexingError("broken PDF")

    monkeypatch.setattr(search_index, "_extract_pages", fail_extraction)

    with pytest.raises(search_index.IndexingError, match="broken PDF"):
        await search_index.index_book_from_path(db, book_id, "unused.pdf")

    pages = (
        await db.scalars(
            select(BookPage)
            .where(BookPage.book_id == book.id)
            .order_by(BookPage.page)
        )
    ).all()
    assert [page.content for page in pages] == [
        "старый текст один",
        "старый текст два",
    ]


async def test_insert_failure_rolls_back_delete_and_page_count(db, monkeypatch):
    book = await _book_with_old_index(db)
    book_id = book.id

    async def extract_new(_path):
        return ["новый текст один", "новый текст два", "новый текст три"]

    monkeypatch.setattr(search_index, "_extract_pages", extract_new)
    original_execute = db.execute

    async def fail_new_page_insert(statement, *args, **kwargs):
        if isinstance(statement, Insert) and statement.table.name == "book_pages":
            raise RuntimeError("database interrupted during insert")
        return await original_execute(statement, *args, **kwargs)

    monkeypatch.setattr(db, "execute", fail_new_page_insert)

    with pytest.raises(RuntimeError, match="database interrupted"):
        await search_index.index_book_from_path(db, book.id, "unused.pdf")

    pages = (
        await db.scalars(
            select(BookPage)
            .where(BookPage.book_id == book_id)
            .order_by(BookPage.page)
        )
    ).all()
    restored_book = await db.get(Book, book_id)
    assert [page.content for page in pages] == [
        "старый текст один",
        "старый текст два",
    ]
    assert restored_book.total_pages == 2
