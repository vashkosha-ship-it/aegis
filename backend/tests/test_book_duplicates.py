"""Одна и та же книга не должна попадать в библиотеку дважды."""
import hashlib

import pytest

from app.core.storage import get_storage
from app.main import app
from app.models.book import Book
from app.services import books as books_service
from tests.conftest import auth_headers
from tests.test_privacy_epub_indexing import MemoryStorage

PDF = b"%PDF-1.7\n%%EOF"


@pytest.fixture
def storage(monkeypatch):
    memory = MemoryStorage()
    app.dependency_overrides[get_storage] = lambda: memory

    class Job:
        job_id = "job"

    class Queue:
        async def enqueue_job(self, name, book_id):
            return Job()

    async def get_queue():
        return Queue()

    monkeypatch.setattr("app.core.queue.get_queue", get_queue)
    yield memory
    app.dependency_overrides.pop(get_storage, None)


async def _upload(client, admin_user, book_id, content=PDF):
    return await client.post(
        f"/books/{book_id}/pdf",
        files={"file": ("book.pdf", content, "application/pdf")},
        headers=auth_headers(admin_user),
    )


@pytest.mark.asyncio
async def test_second_upload_of_same_file_is_rejected(client, db, admin_user, storage):
    first = Book(title="Оригинал", author="А", description="")
    second = Book(title="Копия", author="Б", description="")
    db.add_all([first, second])
    await db.commit()

    assert (await _upload(client, admin_user, first.id)).status_code == 200
    await db.refresh(first)
    assert first.file_sha256 == hashlib.sha256(PDF).hexdigest()
    files_before = set(storage.files)

    response = await _upload(client, admin_user, second.id)

    assert response.status_code == 409
    assert "Оригинал" in response.json()["detail"]
    assert response.headers["X-Duplicate-Of"] == str(first.id)
    # Файл копии не остался в хранилище, у второй книги файла нет.
    assert set(storage.files) == files_before
    await db.refresh(second)
    assert second.pdf_storage_key is None and second.file_sha256 is None


@pytest.mark.asyncio
async def test_reuploading_same_file_to_same_book_is_allowed(client, db, admin_user, storage):
    book = Book(title="Книга", author="А", description="")
    db.add(book)
    await db.commit()

    assert (await _upload(client, admin_user, book.id)).status_code == 200
    assert (await _upload(client, admin_user, book.id)).status_code == 200


@pytest.mark.asyncio
async def test_check_endpoint_finds_file_and_title(client, db, admin_user):
    digest = hashlib.sha256(PDF).hexdigest()
    db.add(Book(title="Компьютерные сети. 6-е издание", author="Л. Петерсон",
                description="", file_sha256=digest))
    await db.commit()
    headers = auth_headers(admin_user)

    by_file = await client.post("/books/duplicates/check", json={"sha256": digest}, headers=headers)
    assert by_file.json()["duplicate"] is True and by_file.json()["reason"] == "file"

    by_title = await client.post(
        "/books/duplicates/check", json={"title": "компьютерные  сети — 6-е издание"}, headers=headers,
    )
    assert by_title.json()["reason"] == "title"

    fresh = await client.post("/books/duplicates/check", json={"title": "Другая книга"}, headers=headers)
    assert fresh.json() == {"duplicate": False, "reason": None, "book": None}


@pytest.mark.asyncio
async def test_duplicate_endpoints_are_admin_only(client, approved_user):
    headers = auth_headers(approved_user)
    assert (await client.get("/books/duplicates/all", headers=headers)).status_code == 403
    assert (await client.post("/books/duplicates/check", json={}, headers=headers)).status_code == 403


@pytest.mark.asyncio
async def test_list_duplicates_groups_by_file_or_title(client, db, admin_user):
    db.add_all([
        Book(title="Управление во время кризиса", author="HBR", description="", file_sha256="a" * 64),
        Book(title="Другая обложка", author="HBR", description="", file_sha256="a" * 64),
        Book(title="Управление во время кризиса!", author="HBR", description=""),
        Book(title="Единственная", author="X", description=""),
    ])
    await db.commit()

    response = await client.get("/books/duplicates/all", headers=auth_headers(admin_user))

    groups = response.json()
    assert len(groups) == 1
    titles = [b["title"] for b in groups[0]["books"]]
    assert titles[0] == "Управление во время кризиса"
    assert len(titles) == 3


def test_normalize_title():
    assert books_service.normalize_title("  Ёжик, в тумане! ") == "ежик в тумане"
