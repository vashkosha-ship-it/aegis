"""Загрузка книг: PDF с мусором перед заголовком принимается, остальные
форматы отклоняются с понятной причиной."""
import pytest

from app.core.file_validation import (
    FileValidationError,
    sniff_book_kind,
    validate_epub_head,
    validate_pdf_head,
)
from app.core.storage import get_storage
from app.main import app
from app.models.book import Book
from tests.conftest import auth_headers
from tests.test_privacy_epub_indexing import MemoryStorage


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


@pytest.mark.parametrize("head", [
    b"%PDF-1.7\n",
    b"\xef\xbb\xbf%PDF-1.4\n",                 # BOM
    b"\x00" * 128 + b"%PDF-1.5\n",             # MacBinary-обёртка
    b"\r\n\r\n   %PDF-1.6",                    # пустые строки
    b"x" * 1000 + b"%PDF-1.3",                  # мусор в пределах 1024 байт
])
def test_pdf_with_leading_bytes_is_accepted(head):
    validate_pdf_head(head, declared_mime="application/pdf")


@pytest.mark.parametrize("mime", ["application/octet-stream", "application/x-pdf", None, ""])
def test_pdf_accepted_with_generic_mime(mime):
    validate_pdf_head(b"%PDF-1.7", declared_mime=mime)


@pytest.mark.parametrize(("head", "kind", "fragment"), [
    (b"", "empty", "пустой"),
    (b"<!DOCTYPE html><html><head>", "html", "веб-страница"),
    (b"\n\n<html lang=\"ru\">", "html", "веб-страница"),
    (b"AT&TFORM\x00\x00\x00\x00DJVM", "djvu", "DjVu"),
    (b"PK\x03\x04" + b"\x00" * 26 + b"mimetypeapplication/epub+zip", "epub", "EPUB"),
    (b"PK\x03\x04" + b"\x00" * 26 + b"[Content_Types].xml", "word", "Word"),
    (b"PK\x03\x04" + b"\x00" * 26 + b"book.pdf", "archive", "архив"),
    (b"Rar!\x1a\x07\x00", "archive", "архив"),
    (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "word", "Word"),
    (b"\x00" * 60 + b"BOOKMOBI", "mobi", "Kindle"),
    (b"ITSF\x03\x00\x00\x00", "chm", "CHM"),
    (b"{\\rtf1\\ansi", "rtf", "RTF"),
    (b'<?xml version="1.0"?><FictionBook xmlns="', "fb2", "FB2"),
])
def test_not_a_pdf_explains_what_it_is(head, kind, fragment):
    assert sniff_book_kind(head) == kind
    with pytest.raises(FileValidationError) as error:
        validate_pdf_head(head, declared_mime="application/pdf")
    assert fragment in str(error.value)


def test_pdf_header_beyond_1024_bytes_rejected():
    with pytest.raises(FileValidationError):
        validate_pdf_head(b"x" * 1100 + b"%PDF-1.7", declared_mime="application/pdf")


def test_pdf_named_epub_gets_hint():
    with pytest.raises(FileValidationError) as error:
        validate_epub_head(b"%PDF-1.7\n", declared_mime="application/epub+zip")
    assert "как PDF" in str(error.value)


@pytest.mark.asyncio
async def test_upload_accepts_pdf_with_leading_junk(client, db, admin_user, storage):
    book = Book(title="Книга с мусором перед заголовком", author="А", description="")
    db.add(book)
    await db.commit()

    body = b"\xef\xbb\xbf" + b"%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    response = await client.post(
        f"/books/{book.id}/pdf",
        headers=auth_headers(admin_user),
        files={"file": ("book.pdf", body, "application/octet-stream")},
    )
    assert response.status_code == 200, response.text

    html = await client.post(
        f"/books/{book.id}/pdf",
        headers=auth_headers(admin_user),
        files={"file": ("book.pdf", b"<!doctype html><html>", "application/pdf")},
    )
    assert html.status_code == 400
    assert "веб-страница" in html.json()["detail"]
