"""Админка → «Названия и теги»: проверка карточек всех книг по их тексту."""
import json
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.models.book import Book, Category
from app.models.book_metadata_job import BookMetadataChange, BookMetadataJob
from app.models.book_page import BookPage
from app.services import book_autofill
from tests.conftest import auth_headers


async def _book(db, *, title, author, categories, text="Титульный лист книги", status="succeeded"):
    book = Book(
        title=title, author=author, description="x",
        categories=categories, indexing_status=status,
    )
    db.add(book)
    await db.flush()
    if text:
        db.add(BookPage(book_id=book.id, page=1, content=text))
    await db.commit()
    return book.id


async def _load(db, book_id):
    db.expire_all()
    return await db.scalar(
        select(Book).options(selectinload(Book.categories)).where(Book.id == book_id)
    )


def _model(monkeypatch, answer: dict):
    call = AsyncMock(return_value=json.dumps(answer, ensure_ascii=False))
    monkeypatch.setattr(book_autofill, "chat_completion", call)
    return call


@pytest.mark.parametrize(("author", "bad"), [
    ("—", True), ("Unknown", True), ("Admin", True), ("Windows User", True),
    ("u6fonter", True), ("laral", True), ("Nieizviestnyi", True),
    ("Lance A. Leventhal", False), ("Эндрю Хоффман", False), ("IEEE", False),
])
def test_bad_author_detection(author, bad):
    assert book_autofill.looks_like_bad_author(author) is bad


@pytest.mark.parametrize(("title", "bad"), [
    ("714633450", True),
    ("<4D6963726F736F6674>", True),
    ("508765 1 En Print.indd u6fonter", True),
    ("Skrynnik O V DevOps dlia IT mie Nieizviestnyi", True),
    ("[Boominfo.CO] Razrabotka proghr Nieizviestnyi", True),
    ("DevSecOps for Azure", False),
    ("Безопасность веб-приложений", False),
    ("IEEE Spectrum, July 2024", False),
])
def test_bad_title_detection(title, bad):
    assert book_autofill.looks_like_bad_title(title) is bad


@pytest.mark.asyncio
async def test_review_fixes_transliteration_and_records_change(db, monkeypatch):
    devops = Category(name="DevOps и облака")
    db.add(Book(title="Другая", author="А", description="x", categories=[devops]))
    await db.commit()
    book_id = await _book(
        db,
        title="Skrynnik O V DevOps dlia IT mie Nieizviestnyi",
        author="—",
        categories=[Category(name="Без категории")],
        text="О. В. Скрынник. DevOps для ИТ-менеджеров. Москва, 2023.",
    )
    call = _model(monkeypatch, {
        "title": "DevOps для ИТ-менеджеров",
        "author": "О. В. Скрынник",
        "categories": ["DevOps и облака", "Выдуманная"],
    })

    outcome = await book_autofill.review_and_fix_book(db, book_id, job_id=None)

    assert outcome == "changed"
    book = await _load(db, book_id)
    assert (book.title, book.author) == ("DevOps для ИТ-менеджеров", "О. В. Скрынник")
    assert [c.name for c in book.categories] == ["DevOps и облака"]
    change = await db.scalar(select(BookMetadataChange).where(BookMetadataChange.book_id == book_id))
    assert change.old_title == "Skrynnik O V DevOps dlia IT mie Nieizviestnyi"
    assert change.old_author == "—"
    assert change.old_categories == ["Без категории"]
    prompt = call.await_args.args[0][0]["content"]
    assert "Скрынник" in prompt and "- DevOps и облака" in prompt


@pytest.mark.asyncio
async def test_review_keeps_existing_tags(db, monkeypatch):
    book_id = await _book(
        db, title="Python 3", author="Admin", categories=[Category(name="Программирование")],
    )
    call = _model(monkeypatch, {
        "title": "Python 3. Самое необходимое", "author": "Николай Прохоренок",
        "categories": ["Базы данных"],
    })

    assert await book_autofill.review_and_fix_book(db, book_id, job_id=None) == "changed"
    book = await _load(db, book_id)
    assert [c.name for c in book.categories] == ["Программирование"]
    # Теги не нужны — модель о них и не спрашивают.
    assert "Подбери от 1 до 3 тем" not in call.await_args.args[0][0]["content"]


@pytest.mark.asyncio
async def test_review_leaves_correct_card_unchanged(db, monkeypatch):
    book_id = await _book(
        db, title="DevSecOps for Azure", author="David Okeyode, Joylynn Kirui",
        categories=[Category(name="DevOps")],
    )
    _model(monkeypatch, {"title": "DevSecOps for Azure", "author": "David Okeyode, Joylynn Kirui"})

    assert await book_autofill.review_and_fix_book(db, book_id, job_id=None) == "unchanged"
    assert (await db.scalar(select(BookMetadataChange))) is None


@pytest.mark.asyncio
async def test_review_ignores_unsure_or_junk_answers(db, monkeypatch):
    book_id = await _book(db, title="714633450", author="Unknown", categories=[Category(name="Сети")])
    _model(monkeypatch, {"title": "", "author": "Admin"})

    assert await book_autofill.review_and_fix_book(db, book_id, job_id=None) == "unchanged"
    book = await _load(db, book_id)
    assert (book.title, book.author) == ("714633450", "Unknown")


@pytest.mark.asyncio
async def test_review_skips_books_waiting_for_indexing(db, monkeypatch):
    book_id = await _book(
        db, title="Kniga", author="—", categories=[], text="", status="queued",
    )
    call = _model(monkeypatch, {"title": "X", "author": "Y"})

    assert await book_autofill.review_and_fix_book(db, book_id, job_id=None) == "skipped"
    call.assert_not_awaited()


@pytest.mark.asyncio
async def test_after_indexing_autofill_fixes_junk_author(db, monkeypatch):
    """Автозаполнение после индексации ловит не только «—», но и «Admin»."""
    book_id = await _book(
        db, title="Hacking Secrets", author="Windows User", categories=[Category(name="Сети")],
    )
    monkeypatch.setattr(book_autofill, "chat_completion", AsyncMock(return_value=json.dumps(
        {"title": "Hacking Secret Ciphers with Python", "author": "Al Sweigart", "categories": []},
    )))

    changed = await book_autofill.autofill_book(db, book_id)

    assert {"title", "author"} <= set(changed)
    assert (await _load(db, book_id)).author == "Al Sweigart"


@pytest.mark.asyncio
async def test_start_job_enqueues_all_books(client, db, admin_user, monkeypatch):
    await _book(db, title="Книга", author="Автор", categories=[])
    enqueued = []

    class Job:
        job_id = "arq-1"

    class Queue:
        async def enqueue_job(self, name, *args, **kwargs):
            enqueued.append((name, args, kwargs))
            return Job()

    async def get_queue():
        return Queue()

    monkeypatch.setattr("app.core.queue.get_queue", get_queue)

    response = await client.post("/admin/book-metadata/jobs", headers=auth_headers(admin_user))
    assert response.status_code == 202, response.text
    body = response.json()
    assert body["started"] is True
    assert enqueued[0][0] == "review_book_metadata_bulk"
    assert len(enqueued[0][1][1]) == body["job"]["total_books"] >= 1
    # В начало очереди: score из прошлого, раньше всей индексации.
    assert enqueued[0][2]["_defer_until"].year == 2000

    # Не начавшуюся задачу повторный запуск поднимает в начало очереди.
    again = await client.post("/admin/book-metadata/jobs", headers=auth_headers(admin_user))
    assert again.json()["reason"] == "requeued"
    assert again.json()["job"]["id"] == body["job"]["id"]
    assert len(enqueued) == 2 and enqueued[1][1][0] == body["job"]["id"]

    latest = await client.get("/admin/book-metadata/jobs/latest", headers=auth_headers(admin_user))
    assert latest.json()["status"] == "queued"
    changes = await client.get("/admin/book-metadata/changes", headers=auth_headers(admin_user))
    assert changes.status_code == 200


@pytest.mark.asyncio
async def test_worker_counts_outcomes(db, engine, monkeypatch):
    from app import worker

    job = BookMetadataJob(
        id="job-1", status="queued", total_books=3, processed_books=0,
        changed_books=0, skipped_books=0, failed_books=0, created_by_username="admin",
    )
    db.add(job)
    await db.commit()
    outcomes = {1: "changed", 2: "unchanged", 3: RuntimeError("boom")}

    async def fake_review(_db, book_id, *, job_id):
        result = outcomes[book_id]
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(worker, "review_and_fix_book", fake_review)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(worker, "AsyncSessionLocal", maker)

    await worker.review_book_metadata_bulk({}, "job-1", [1, 2, 3])

    db.expire_all()
    job = await db.get(BookMetadataJob, "job-1")
    assert (job.status, job.processed_books, job.changed_books, job.failed_books) == (
        "completed", 3, 1, 1,
    )


@pytest.mark.asyncio
async def test_worker_skips_duplicate_copy_of_job(db, engine, monkeypatch):
    """Старая копия задачи после подъёма в начало очереди ничего не делает."""
    from app import worker

    db.add(BookMetadataJob(
        id="job-done", status="completed", total_books=1, processed_books=1,
        changed_books=0, skipped_books=0, failed_books=0, created_by_username="admin",
    ))
    await db.commit()
    called = AsyncMock()
    monkeypatch.setattr(worker, "review_and_fix_book", called)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(worker, "AsyncSessionLocal", maker)

    result = await worker.review_book_metadata_bulk({}, "job-done", [1])

    assert result == {"job_id": "job-done", "skipped": "completed"}
    called.assert_not_awaited()
