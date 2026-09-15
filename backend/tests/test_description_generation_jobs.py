"""Фоновая массовая генерация описаний и её постоянный статус."""
from __future__ import annotations

from types import SimpleNamespace

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import worker
from app.core import queue as queue_module
from app.models.book import Book
from app.models.description_job import DescriptionGenerationJob
from app.services.deepseek_client import DeepSeekError
from tests.conftest import auth_headers


class FakeQueue:
    async def enqueue_job(self, name, job_id, book_ids):
        assert name == "generate_missing_book_descriptions"
        assert job_id
        assert book_ids
        return SimpleNamespace(job_id="arq-description-job")


async def test_description_job_runs_in_worker_and_keeps_progress(
    client, db, engine, admin_user, monkeypatch
):
    good = Book(title="Хорошая книга", author="Автор", description="")
    bad = Book(title="Проблемная книга", author="Автор", description="")
    existing = Book(title="Готовая", author="Автор", description="Уже заполнено")
    db.add_all([good, bad, existing])
    await db.commit()
    for book in (good, bad, existing):
        await db.refresh(book)

    async def get_queue():
        return FakeQueue()

    monkeypatch.setattr(queue_module, "get_queue", get_queue)
    response = await client.post(
        "/admin/book-descriptions/jobs", headers=auth_headers(admin_user)
    )
    assert response.status_code == 202
    payload = response.json()
    assert payload["started"] is True
    assert payload["job"]["total_books"] == 2
    assert payload["job"]["status"] == "queued"

    latest = await client.get(
        "/admin/book-descriptions/jobs/latest", headers=auth_headers(admin_user)
    )
    assert latest.status_code == 200
    assert latest.json()["id"] == payload["job"]["id"]

    async def generate(*, title, author, categories):
        del author, categories
        if title == "Проблемная книга":
            raise DeepSeekError("provider unavailable")
        return f"Описание: {title}"

    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(worker, "AsyncSessionLocal", maker)
    monkeypatch.setattr(worker, "generate_book_description", generate)

    result = await worker.generate_missing_book_descriptions(
        {}, payload["job"]["id"], [good.id, bad.id]
    )
    assert result["succeeded_books"] == 1
    assert result["failed_books"] == 1

    db.expire_all()
    job = await db.get(DescriptionGenerationJob, payload["job"]["id"])
    assert job.status == "completed"
    assert job.processed_books == 2
    assert job.succeeded_books == 1
    assert job.failed_books == 1
    assert "provider unavailable" in job.last_error
    assert job.started_at is not None
    assert job.finished_at is not None

    saved_good = await db.scalar(select(Book).where(Book.id == good.id))
    saved_bad = await db.scalar(select(Book).where(Book.id == bad.id))
    assert saved_good.description == "Описание: Хорошая книга"
    assert saved_bad.description == ""


async def test_description_job_is_admin_only(client, approved_user):
    response = await client.post(
        "/admin/book-descriptions/jobs", headers=auth_headers(approved_user)
    )
    assert response.status_code == 403


def test_worker_registers_background_description_generation():
    assert worker.generate_missing_book_descriptions in worker.WorkerSettings.functions
