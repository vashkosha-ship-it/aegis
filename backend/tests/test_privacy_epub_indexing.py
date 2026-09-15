"""Регрессии для приватности, EPUB и автоматической индексации книг."""

from __future__ import annotations

import io
import os
import tempfile
import zipfile
from collections.abc import AsyncIterator

import pytest
from pydantic import ValidationError
from sqlalchemy import select

from app import worker
from app.core.file_validation import FileValidationError, validate_epub_archive
from app.core.storage import StorageBackend, StorageNotFound, get_storage
from app.main import app
from app.models.book import Book
from app.models.book_page import BookPage
from app.models.library import Review
from app.schemas.auth import UserUpdate
from app.services import search_index
from tests.conftest import auth_headers, make_user


def _epub_bytes(*, unsafe_name: str | None = None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        archive.writestr(
            "META-INF/container.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles><rootfile full-path="EPUB/content.opf"
    media-type="application/oebps-package+xml"/></rootfiles>
</container>""",
        )
        archive.writestr(
            "EPUB/content.opf",
            """<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <manifest><item id="chapter" href="chapter.xhtml"
    media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="chapter"/></spine>
</package>""",
        )
        archive.writestr(
            unsafe_name or "EPUB/chapter.xhtml",
            "<html><body><h1>Глава</h1><p>Текст книги</p></body></html>",
        )
    return buf.getvalue()


class MemoryStorage(StorageBackend):
    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}

    async def save_stream(
        self, key: str, chunks: AsyncIterator[bytes], max_bytes: int
    ) -> int:
        data = bytearray()
        async for chunk in chunks:
            data.extend(chunk)
            if len(data) > max_bytes:
                raise RuntimeError("too large")
        self.files[key] = bytes(data)
        return len(data)

    async def delete(self, key: str) -> None:
        self.files.pop(key, None)

    async def exists(self, key: str) -> bool:
        return key in self.files

    async def size(self, key: str) -> int:
        if key not in self.files:
            raise StorageNotFound(key)
        return len(self.files[key])

    async def open_stream(self, key: str) -> AsyncIterator[bytes]:
        if key not in self.files:
            raise StorageNotFound(key)

        async def iterator():
            yield self.files[key]

        return iterator()

    async def open_range(self, key: str, start: int, end: int) -> AsyncIterator[bytes]:
        if key not in self.files:
            raise StorageNotFound(key)

        async def iterator():
            yield self.files[key][start:end + 1]

        return iterator()


def test_profile_visibility_schema_is_closed_enum():
    assert UserUpdate(profile_visibility="private").profile_visibility == "private"
    with pytest.raises(ValidationError):
        UserUpdate(profile_visibility="friends")


@pytest.mark.asyncio
async def test_profile_visibility_is_persisted(client, db, approved_user):
    response = await client.patch(
        "/me",
        json={"profile_visibility": "private"},
        headers=auth_headers(approved_user),
    )
    assert response.status_code == 200
    assert response.json()["profile_visibility"] == "private"
    await db.refresh(approved_user)
    assert approved_user.profile_visibility == "private"


@pytest.mark.asyncio
async def test_reviews_require_authentication(client, db, approved_user):
    book = Book(title="Закрытые отзывы", author="Автор", description="")
    db.add(book)
    await db.flush()
    db.add(Review(user_id=approved_user.id, book_id=book.id, rating=5, text="Отзыв"))
    await db.commit()

    anonymous = await client.get(f"/books/{book.id}/reviews")
    assert anonymous.status_code == 401
    allowed = await client.get(
        f"/books/{book.id}/reviews", headers=auth_headers(approved_user)
    )
    assert allowed.status_code == 200
    assert allowed.json()[0]["text"] == "Отзыв"


@pytest.mark.asyncio
async def test_private_reviewer_identity_is_hidden(client, db):
    author = await make_user(db, username="private_reviewer")
    viewer = await make_user(db, username="review_viewer")
    author.profile_visibility = "private"
    book = Book(title="Приватный автор", author="Автор", description="")
    db.add(book)
    await db.flush()
    db.add(Review(user_id=author.id, book_id=book.id, rating=4, text="Отзыв"))
    await db.commit()

    response = await client.get(
        f"/books/{book.id}/reviews", headers=auth_headers(viewer)
    )
    assert response.status_code == 200
    assert response.json()[0]["user_id"] == 0
    assert response.json()[0]["user_username"] == "Скрытый пользователь"


@pytest.mark.asyncio
async def test_private_avatar_is_visible_only_to_owner(client, db):
    owner = await make_user(db, username="avatar_owner")
    viewer = await make_user(db, username="avatar_viewer")
    owner.avatar_url = "avatars/private.jpg"
    owner.profile_visibility = "private"
    await db.commit()

    denied = await client.get(
        f"/users/{owner.id}/avatar", headers=auth_headers(viewer)
    )
    assert denied.status_code == 403
    anonymous = await client.get(f"/users/{owner.id}/avatar")
    assert anonymous.status_code == 403


def test_epub_archive_validation_accepts_real_structure_and_rejects_traversal():
    validate_epub_archive(io.BytesIO(_epub_bytes()))
    with pytest.raises(FileValidationError, match="unsafe file path"):
        validate_epub_archive(io.BytesIO(_epub_bytes(unsafe_name="../escape.xhtml")))


@pytest.mark.asyncio
async def test_epub_upload_download_and_admin_has_file(
    client, db, admin_user, approved_user, monkeypatch
):
    storage = MemoryStorage()
    app.dependency_overrides[get_storage] = lambda: storage
    monkeypatch.setattr("app.core.config.settings.STORAGE_BACKEND", "memory")

    class Job:
        job_id = "epub-index-job"

    class Queue:
        async def enqueue_job(self, name, book_id):
            assert name == "index_book"
            assert book_id == book.id
            return Job()

    async def get_queue():
        return Queue()

    monkeypatch.setattr("app.core.queue.get_queue", get_queue)

    book = Book(title="EPUB книга", author="Автор", description="")
    db.add(book)
    await db.commit()
    await db.refresh(book)

    epub_data = _epub_bytes()
    uploaded = await client.post(
        f"/books/{book.id}/epub",
        files={"file": ("book.epub", epub_data, "application/epub+zip")},
        headers=auth_headers(admin_user),
    )
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.json()["kind"] == "epub"
    assert uploaded.json()["index_job_id"] == "epub-index-job"
    assert uploaded.json()["indexing_status"] == "queued"

    await db.refresh(book)
    assert book.file_format == "epub"
    assert book.epub_storage_key
    assert book.pdf_storage_key is None

    anonymous = await client.get(f"/books/{book.id}/epub")
    assert anonymous.status_code == 401
    downloaded = await client.get(
        f"/books/{book.id}/epub", headers=auth_headers(approved_user)
    )
    assert downloaded.status_code == 200
    assert downloaded.content == epub_data
    assert downloaded.headers["content-type"].startswith("application/epub+zip")

    analytics = await client.get(
        f"/admin/books/{book.id}/analytics", headers=auth_headers(admin_user)
    )
    assert analytics.status_code == 200, analytics.text
    assert analytics.json()["has_file"] is True


@pytest.mark.asyncio
async def test_epub_text_is_extracted_in_spine_order():
    fd, path = tempfile.mkstemp(suffix=".epub")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(_epub_bytes())
        sections = await search_index._extract_epub_sections(path)
    finally:
        os.unlink(path)

    assert sections == ["Глава Текст книги"]


@pytest.mark.asyncio
async def test_epub_index_does_not_claim_device_dependent_page_count(
    db, monkeypatch
):
    book = Book(
        title="Индекс EPUB",
        author="Автор",
        description="",
        file_format="epub",
        total_pages=0,
    )
    db.add(book)
    await db.commit()

    async def extract(_path):
        return ["Первая глава", "Вторая глава"]

    monkeypatch.setattr(search_index, "_extract_epub_sections", extract)
    saved = await search_index.index_epub_from_path(db, book.id, "unused.epub")

    assert saved == 2
    await db.refresh(book)
    assert book.total_pages == 0
    pages = (
        await db.scalars(
            select(BookPage).where(BookPage.book_id == book.id).order_by(BookPage.page)
        )
    ).all()
    assert [page.content for page in pages] == ["Первая глава", "Вторая глава"]


@pytest.mark.asyncio
async def test_worker_selects_epub_indexer(monkeypatch):
    book = Book(
        id=73,
        title="Воркер EPUB",
        author="Автор",
        description="",
        file_format="epub",
        epub_storage_key="books/epub/73.epub",
    )

    class Session:
        commits = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def get(self, model, book_id):
            assert model is Book
            assert book_id == 73
            return book

        async def commit(self):
            self.commits += 1

        async def rollback(self):
            pass

    class Storage:
        async def open_stream(self, key):
            assert key == "books/epub/73.epub"

            async def chunks():
                yield b"epub"

            return chunks()

    async def spool(chunks, *, suffix):
        assert suffix == ".epub"
        assert b"".join([part async for part in chunks]) == b"epub"
        return "/tmp/aegis-worker-test.epub"

    async def index_epub(db, book_id, path):
        assert isinstance(db, Session)
        assert book_id == 73
        assert path.endswith(".epub")
        return 2

    monkeypatch.setattr(worker, "AsyncSessionLocal", Session)
    monkeypatch.setattr(worker, "get_storage", Storage)
    monkeypatch.setattr(worker, "spool_to_tempfile", spool)
    monkeypatch.setattr(worker, "index_epub_from_path", index_epub)
    monkeypatch.setattr(worker.os, "unlink", lambda _path: None)

    assert await worker._index_one(73) == 2
    assert book.indexing_status == "succeeded"
    assert book.indexing_error is None
    assert book.indexed_sections == 2
    assert book.indexing_started_at is not None
    assert book.indexing_finished_at is not None
    assert book.indexed_at is not None


@pytest.mark.asyncio
async def test_pdf_upload_replaces_epub_clears_index_and_enqueues(
    client, db, admin_user, monkeypatch
):
    storage = MemoryStorage()
    old_epub = "books/epub/old.epub"
    storage.files[old_epub] = _epub_bytes()
    app.dependency_overrides[get_storage] = lambda: storage

    class Job:
        job_id = "index-job-42"

    class Queue:
        async def enqueue_job(self, name, book_id):
            assert name == "index_book"
            assert book_id == book.id
            return Job()

    async def get_queue():
        return Queue()

    monkeypatch.setattr("app.core.queue.get_queue", get_queue)

    book = Book(
        title="Смена формата",
        author="Автор",
        description="",
        epub_storage_key=old_epub,
        file_format="epub",
        total_pages=10,
    )
    db.add(book)
    await db.flush()
    db.add(BookPage(book_id=book.id, page=1, content="старый индекс"))
    await db.commit()

    response = await client.post(
        f"/books/{book.id}/pdf",
        files={"file": ("book.pdf", b"%PDF-1.7\n%%EOF", "application/pdf")},
        headers=auth_headers(admin_user),
    )
    assert response.status_code == 200, response.text
    assert response.json()["index_job_id"] == "index-job-42"
    assert response.json()["indexing_status"] == "queued"

    await db.refresh(book)
    assert book.indexing_status == "queued"
    assert book.indexing_job_id == "index-job-42"
    assert book.file_format == "pdf"
    assert book.pdf_storage_key
    assert book.epub_storage_key is None
    assert book.total_pages == 0
    assert old_epub not in storage.files
    pages = (await db.scalars(select(BookPage).where(BookPage.book_id == book.id))).all()
    assert pages == []
