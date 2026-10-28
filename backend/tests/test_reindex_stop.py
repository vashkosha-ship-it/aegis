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


@pytest.mark.asyncio
async def test_startup_requeues_books_whose_job_was_lost(db, engine, monkeypatch):
    """Воркер упал посреди массовой индексации: задача пропала, книги висят
    «в очереди». При старте им ставятся собственные задачи; книги, чья задача
    ещё ждёт в очереди, не трогаются."""
    import arq.jobs

    from app import worker

    lost_a = await _book(db, "lost-a", status="queued", text=False)
    lost_b = await _book(db, "lost-b", status="queued", text=False)
    waiting = await _book(db, "waiting", status="queued", text=False)
    done = await _book(db, "done", status="succeeded", text=True)
    for book_id, job_id in ((lost_a, "dead-bulk"), (lost_b, "dead-bulk"), (waiting, "alive"), (done, "dead-bulk")):
        book = await db.get(Book, book_id)
        book.indexing_job_id = job_id
    await db.commit()

    class FakeJob:
        def __init__(self, job_id, _redis):
            self.job_id = job_id

        async def status(self):
            return arq.jobs.JobStatus.queued if self.job_id == "alive" else arq.jobs.JobStatus.in_progress

    class FakeRedis:
        def __init__(self):
            self.enqueued = []

        async def enqueue_job(self, name, book_id):
            self.enqueued.append((name, book_id))
            return FakeJob(f"new-{book_id}", self)

    monkeypatch.setattr(arq.jobs, "Job", FakeJob)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(worker, "AsyncSessionLocal", maker)
    redis = FakeRedis()

    assert await worker.requeue_stuck_indexing({"redis": redis}) == 2
    assert sorted(redis.enqueued) == sorted([("index_book", lost_a), ("index_book", lost_b)])
    db.expire_all()
    assert (await db.get(Book, lost_a)).indexing_job_id == f"new-{lost_a}"
    assert (await db.get(Book, waiting)).indexing_job_id == "alive"
    # Без Redis — ничего не делаем.
    assert await worker.requeue_stuck_indexing({}) == 0
