"""Автозаполнение карточки новой книги по тексту после индексации."""
import json
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.book import Book, Category
from app.models.book_page import BookPage
from app.services import book_autofill, book_descriptions

TITLE_PAGE = "Ларри Петерсон, Брюс Дэви. Компьютерные сети. Системный подход. 6-е издание."


async def _book(db, **fields):
    defaults = dict(
        title="Kompyuternye seti 6 izd CKba2sE",
        author="—",
        description="",
        categories=[Category(name="Без категории")],
    )
    defaults.update(fields)
    book = Book(**defaults)
    db.add(book)
    await db.flush()
    db.add(BookPage(book_id=book.id, page=1, content=TITLE_PAGE))
    await db.commit()
    return book.id


async def _load(db, book_id):
    db.expire_all()
    return await db.scalar(
        select(Book).options(selectinload(Book.categories)).where(Book.id == book_id)
    )


def _mock_models(monkeypatch, meta: dict, description: str = "Описание по тексту книги."):
    metadata_call = AsyncMock(return_value=json.dumps(meta, ensure_ascii=False))
    description_call = AsyncMock(return_value=description)
    monkeypatch.setattr(book_autofill, "chat_completion", metadata_call)
    monkeypatch.setattr(book_descriptions, "chat_completion", description_call)
    return metadata_call, description_call


@pytest.mark.asyncio
async def test_autofill_fills_title_author_categories_and_description(db, monkeypatch):
    # Категория уже используется в каталоге — только из таких и выбираем.
    networks = Category(name="Компьютерные сети")
    db.add(Book(title="Другая", author="А", description="x", categories=[networks]))
    await db.commit()
    book_id = await _book(db)
    metadata_call, _ = _mock_models(
        monkeypatch,
        {
            "title": "Компьютерные сети. Системный подход, 6-е издание",
            "author": "Ларри Петерсон, Брюс Дэви",
            "categories": ["Компьютерные сети", "Выдуманная категория"],
        },
    )

    changed = await book_autofill.autofill_book(db, book_id)

    book = await _load(db, book_id)
    assert book.title == "Компьютерные сети. Системный подход, 6-е издание"
    assert book.author == "Ларри Петерсон, Брюс Дэви"
    assert [c.name for c in book.categories] == ["Компьютерные сети"]
    assert book.description == "Описание по тексту книги."
    assert set(changed) == {"title", "author", "categories", "description"}

    prompt = metadata_call.await_args.args[0][0]["content"]
    assert TITLE_PAGE in prompt
    assert "<book_excerpt>" in prompt
    assert "- Компьютерные сети" in prompt


@pytest.mark.asyncio
async def test_autofill_keeps_what_admin_entered(db, monkeypatch):
    book_id = await _book(
        db,
        title="Название от админа",
        author="Автор от админа",
        description="Описание от админа",
        categories=[Category(name="Сети")],
    )
    metadata_call, description_call = _mock_models(
        monkeypatch, {"title": "Другое", "author": "Другой", "categories": []}
    )

    changed = await book_autofill.autofill_book(db, book_id)

    assert changed == []
    metadata_call.assert_not_awaited()
    description_call.assert_not_awaited()
    book = await _load(db, book_id)
    assert (book.title, book.author, book.description) == (
        "Название от админа", "Автор от админа", "Описание от админа",
    )


@pytest.mark.asyncio
async def test_autofill_leaves_fields_when_model_is_unsure(db, monkeypatch):
    book_id = await _book(db)
    _mock_models(monkeypatch, {"title": "", "author": "", "categories": []}, description="")

    changed = await book_autofill.autofill_book(db, book_id)

    assert changed == []
    book = await _load(db, book_id)
    assert book.title == "Kompyuternye seti 6 izd CKba2sE"
    assert book.author == "—"


@pytest.mark.asyncio
async def test_autofill_ignores_malformed_model_answer(db, monkeypatch):
    book_id = await _book(db)
    monkeypatch.setattr(book_autofill, "chat_completion", AsyncMock(return_value="не JSON"))
    monkeypatch.setattr(book_descriptions, "chat_completion", AsyncMock(return_value="Описание."))

    changed = await book_autofill.autofill_book(db, book_id)

    assert changed == ["description"]
    assert (await _load(db, book_id)).author == "—"


@pytest.mark.asyncio
async def test_worker_autofill_failure_does_not_fail_indexing(monkeypatch):
    from app import worker

    async def boom(db, book_id):
        raise RuntimeError("DeepSeek недоступен")

    monkeypatch.setattr(worker, "autofill_book", boom)

    assert await worker._autofill_after_indexing(1) == []


@pytest.mark.asyncio
async def test_autofill_reports_duplicate_of_existing_book(db, monkeypatch):
    db.add(Book(title="Компьютерные сети. Системный подход, 6-е издание",
                author="Ларри Петерсон, Брюс Дэви", description="x"))
    await db.commit()
    book_id = await _book(db)
    _mock_models(
        monkeypatch,
        {"title": "Компьютерные сети. Системный подход, 6-е издание",
         "author": "Ларри Петерсон, Брюс Дэви", "categories": []},
    )

    changed = await book_autofill.autofill_book(db, book_id)

    assert len(changed) == 1 and changed[0].startswith("duplicate_of:")
    # Карточку дубликата не трогаем — воркер её удалит.
    assert (await _load(db, book_id)).author == "—"


@pytest.mark.asyncio
async def test_worker_drops_duplicate_book(db, monkeypatch):
    from app import worker

    existing = Book(title="Оригинал", author="Автор", description="")
    db.add(existing)
    await db.commit()
    existing_id = existing.id
    book_id = await _book(db)

    class Storage:
        deleted: list = []

        async def delete(self, key):
            self.deleted.append(key)

    monkeypatch.setattr(worker, "get_storage", Storage)

    await worker._drop_duplicate(db, book_id, existing_id)

    db.expire_all()
    assert await db.get(Book, book_id) is None
    assert await db.get(Book, existing_id) is not None
