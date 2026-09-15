"""Постоянные состояния полнотекстовой индексации книг."""

from __future__ import annotations

import pytest

from app import worker
from app.core.storage import StorageNotFound
from app.models.book import Book
from app.services.search_index import IndexingError
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_reindex_persists_queued_status_and_admin_can_read_it(
    client, db, admin_user, approved_user, monkeypatch
):
    book = Book(
        title="Статус индекса",
        author="Автор",
        description="",
        pdf_storage_key="books/pdf/status.pdf",
    )
    db.add(book)
    await db.commit()

    class Job:
        job_id = "persistent-index-job"

    class Queue:
        async def enqueue_job(self, name, book_id):
            assert (name, book_id) == ("index_book", book.id)
            return Job()

    async def get_queue():
        return Queue()

    monkeypatch.setattr("app.core.queue.get_queue", get_queue)
    response = await client.post(
        f"/books/{book.id}/reindex", headers=auth_headers(admin_user)
    )
    assert response.status_code == 202, response.text

    await db.refresh(book)
    assert book.indexing_status == "queued"
    assert book.indexing_job_id == "persistent-index-job"
    assert book.indexing_error is None

    status = await client.get(
        f"/books/{book.id}/index-status", headers=auth_headers(admin_user)
    )
    assert status.status_code == 200
    assert status.json() == {
        "book_id": book.id,
        "status": "queued",
        "job_id": "persistent-index-job",
        "error": None,
        "started_at": None,
        "finished_at": None,
        "indexed_at": None,
        "indexed_sections": 0,
    }
    forbidden = await client.get(
        f"/books/{book.id}/index-status", headers=auth_headers(approved_user)
    )
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_queue_failure_is_persisted(client, db, admin_user, monkeypatch):
    book = Book(
        title="Очередь недоступна",
        author="Автор",
        description="",
        pdf_storage_key="books/pdf/unavailable.pdf",
    )
    db.add(book)
    await db.commit()

    async def get_queue():
        return None

    monkeypatch.setattr("app.core.queue.get_queue", get_queue)
    response = await client.post(
        f"/books/{book.id}/reindex", headers=auth_headers(admin_user)
    )
    assert response.status_code == 503

    await db.refresh(book)
    assert book.indexing_status == "failed"
    assert book.indexing_error == "Очередь индексации недоступна"
    assert book.indexing_finished_at is not None


@pytest.mark.asyncio
async def test_worker_persists_storage_failure(monkeypatch):
    book = Book(
        id=91,
        title="Потерянный файл",
        author="Автор",
        description="",
        pdf_storage_key="books/pdf/missing.pdf",
    )

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def get(self, model, book_id):
            assert (model, book_id) == (Book, 91)
            return book

        async def commit(self):
            pass

        async def rollback(self):
            pass

    class MissingStorage:
        async def open_stream(self, _key):
            raise StorageNotFound("missing")

    monkeypatch.setattr(worker, "AsyncSessionLocal", Session)
    monkeypatch.setattr(worker, "get_storage", MissingStorage)

    with pytest.raises(IndexingError, match="отсутствует"):
        await worker._index_one(91)

    assert book.indexing_status == "failed"
    assert "IndexingError" in book.indexing_error
    assert book.indexing_started_at is not None
    assert book.indexing_finished_at is not None


@pytest.mark.asyncio
async def test_worker_startup_marks_interrupted_indexing_failed(db, monkeypatch):
    book = Book(
        title="Прерванная индексация",
        author="Автор",
        description="",
        pdf_storage_key="books/pdf/interrupted.pdf",
        indexing_status="running",
    )
    db.add(book)
    await db.commit()

    class SessionContext:
        async def __aenter__(self):
            return db

        async def __aexit__(self, *_args):
            return False

    monkeypatch.setattr(worker, "AsyncSessionLocal", SessionContext)
    await worker.recover_interrupted_indexing({})

    await db.refresh(book)
    assert book.indexing_status == "failed"
    assert book.indexing_error == "Индексация прервана перезапуском воркера"
    assert book.indexing_finished_at is not None
