"""Дубликаты книг: не добавляются при загрузке и удаляются из каталога."""
import hashlib

import pytest
from sqlalchemy import select

from app.core.storage import get_storage
from app.main import app
from app.models.book import Book
from app.services import books as books_service
from tests.conftest import auth_headers
from tests.test_privacy_epub_indexing import MemoryStorage

PDF = b"%PDF-1.7\n1 0 obj<<>>endobj\n%%EOF"


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


def test_normalize_book_text_ignores_case_punctuation_and_yo():
    assert books_service.normalize_book_text(
        "Компьютерные сети. Системный подход, 6-е издание"
    ) == books_service.normalize_book_text("компьютерные  сети системный подход 6 е издание")
    assert books_service.normalize_book_text("Всё") == "все"


@pytest.mark.asyncio
async def test_create_rejects_same_title_and_author(client, db, admin_user):
    db.add(Book(title="Безопасность веб-приложений", author="Эндрю Хоффман", description=""))
    await db.commit()

    response = await client.post(
        "/books",
        json={"title": "безопасность веб приложений", "author": "Эндрю  Хоффман", "categories": []},
        headers=auth_headers(admin_user),
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "duplicate_book"


@pytest.mark.asyncio
async def test_create_allows_same_title_by_other_author(client, db, admin_user):
    db.add(Book(title="Основы Java", author="Николай Прохоренок", description=""))
    await db.commit()

    response = await client.post(
        "/books",
        json={"title": "Основы Java", "author": "Другой Автор", "categories": []},
        headers=auth_headers(admin_user),
    )

    assert response.status_code == 201, response.text


@pytest.mark.asyncio
async def test_same_file_cannot_be_uploaded_twice(client, db, admin_user, storage):
    first = Book(title="Первая", author="А", description="")
    second = Book(title="Вторая", author="Б", description="")
    db.add_all([first, second])
    await db.commit()

    ok = await client.post(
        f"/books/{first.id}/pdf",
        files={"file": ("a.pdf", PDF, "application/pdf")},
        headers=auth_headers(admin_user),
    )
    assert ok.status_code == 200, ok.text
    await db.refresh(first)
    assert first.file_sha256 == hashlib.sha256(PDF).hexdigest()
    files_before = set(storage.files)

    dup = await client.post(
        f"/books/{second.id}/pdf",
        files={"file": ("b.pdf", PDF, "application/pdf")},
        headers=auth_headers(admin_user),
    )

    assert dup.status_code == 409
    assert dup.json()["detail"]["existing_book_id"] == first.id
    # Загруженная копия не осталась в хранилище, книга без файла.
    assert set(storage.files) == files_before
    await db.refresh(second)
    assert second.pdf_storage_key is None


@pytest.mark.asyncio
async def test_duplicate_check_endpoint(client, db, admin_user):
    db.add(Book(title="Kafka Streams in Action", author="William P. Bejeck Jr.",
                description="", file_sha256="a" * 64))
    await db.commit()
    headers = auth_headers(admin_user)

    by_hash = await client.get(f"/books/duplicate-check?sha256={'a' * 64}", headers=headers)
    by_title = await client.get(
        "/books/duplicate-check", params={"title": "kafka streams in action", "author": "—"},
        headers=headers,
    )
    none = await client.get(f"/books/duplicate-check?sha256={'b' * 64}", headers=headers)

    assert by_hash.json()["duplicate"] is True
    assert by_title.json()["duplicate"] is True
    assert none.json() == {"duplicate": False}


@pytest.mark.asyncio
async def test_duplicate_check_is_admin_only(client, approved_user):
    response = await client.get(
        f"/books/duplicate-check?sha256={'a' * 64}", headers=auth_headers(approved_user)
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_remove_duplicates_keeps_most_read_copy(client, db, admin_user, storage):
    storage.files["books/pdf/old.pdf"] = PDF
    storage.files["books/pdf/new.pdf"] = PDF
    kept = Book(title="Управление во время кризиса", author="Harvard Business Review",
                description="", views=5)
    copy = Book(title="Управление во время кризиса", author="Harvard Business Review",
                description="", views=1, pdf_storage_key="books/pdf/new.pdf")
    same_file = Book(title="Другое название", author="Кто-то", description="",
                     file_sha256="c" * 64)
    same_file_2 = Book(title="Совсем другое", author="Иной", description="",
                       file_sha256="c" * 64)
    single = Book(title="Уникальная", author="Автор", description="")
    db.add_all([copy, kept, same_file, same_file_2, single])
    await db.commit()
    headers = auth_headers(admin_user)

    preview = (await client.get("/books/admin/duplicates", headers=headers)).json()
    assert len(preview) == 2
    crisis = next(g for g in preview if g["keep"]["id"] in (kept.id, copy.id))
    assert crisis["keep"]["id"] == kept.id
    assert [b["id"] for b in crisis["remove"]] == [copy.id]

    result = await client.post("/books/admin/duplicates/remove", headers=headers)

    assert sorted(result.json()["removed"]) == sorted([copy.id, same_file_2.id])
    remaining = {b.id for b in (await db.scalars(select(Book))).all()}
    assert remaining == {kept.id, same_file.id, single.id}
    assert "books/pdf/new.pdf" not in storage.files
    assert (await client.get("/books/admin/duplicates", headers=headers)).json() == []
