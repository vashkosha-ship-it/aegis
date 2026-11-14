"""EPUB, перегнанные из PDF (pdftohtml): находим и помечаем, не скрывая."""
import io
import zipfile

import pytest

from app.core.storage import LocalStorage
from app.models.book import Book
from app.services.book_file_check import WARNING_PDF_CONVERSION, epub_conversion_warning_for_file
from scripts import find_pdf_converted_epubs as finder
from tests.conftest import auth_headers

PDFTOHTML_HEAD = '<head><meta name="generator" content="pdftohtml 0.36"/></head>'


def _epub(head: str, filler: int = 0) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("mimetype", "application/epub+zip")
        # Большая картинка в начале архива — проверка не должна её качать.
        if filler:
            z.writestr("images/big.bin", bytes(range(256)) * (filler // 256), compress_type=zipfile.ZIP_STORED)
        z.writestr("index_split_000.html", f"<html>{head}<body><p>Ев ропол  сооб щил</p></body></html>")
    return buf.getvalue()


def test_detects_pdftohtml(tmp_path):
    bad = tmp_path / "bad.epub"
    bad.write_bytes(_epub(PDFTOHTML_HEAD))
    good = tmp_path / "good.epub"
    good.write_bytes(_epub('<head><meta name="generator" content="Sigil"/></head>'))
    assert epub_conversion_warning_for_file(str(bad)) == WARNING_PDF_CONVERSION
    assert epub_conversion_warning_for_file(str(good)) is None
    assert epub_conversion_warning_for_file(str(tmp_path / "missing.epub")) is None


@pytest.mark.asyncio
async def test_script_reads_only_parts_and_marks(tmp_path, db, monkeypatch, client, approved_user, admin_user):
    storage = LocalStorage(tmp_path)
    files = {
        "bad.epub": _epub(PDFTOHTML_HEAD, filler=3 * 1024 * 1024),
        "good.epub": _epub('<head><meta name="generator" content="Sigil"/></head>'),
    }
    for name, data in files.items():
        async def payload(data=data):
            yield data
        await storage.save_stream(f"books/epub/{name}", payload(), 20 * 1024 * 1024)
    bad = Book(title="Хакер", author="А", file_format="epub", epub_storage_key="books/epub/bad.epub")
    good = Book(title="Норм", author="А", file_format="epub", epub_storage_key="books/epub/good.epub",
                file_warning=WARNING_PDF_CONVERSION)  # файл уже заменили
    db.add_all([bad, good])
    await db.commit()

    fetched = []
    original = storage.open_range

    async def counting_range(key, start, end):
        fetched.append(end - start + 1)
        return await original(key, start, end)

    monkeypatch.setattr(storage, "open_range", counting_range)

    class Session:
        async def __aenter__(self):
            return db

        async def __aexit__(self, *_):
            return False

    monkeypatch.setattr(finder, "AsyncSessionLocal", Session)
    report = await finder.run(storage, apply=True, progress=lambda m: None)

    assert [t for _, t in report["converted"]] == ["Хакер"]
    assert [t for _, t in report["cleared"]] == ["Норм"]
    assert sum(fetched) < 1024 * 1024, "картинку на 3 МБ скачивать не нужно"
    await db.refresh(bad)
    await db.refresh(good)
    assert (bad.file_warning, good.file_warning) == (WARNING_PDF_CONVERSION, None)

    # Книга остаётся видимой читателю; админ видит пометку.
    reader = await client.get(f"/books/{bad.id}", headers=auth_headers(approved_user))
    assert reader.status_code == 200
    admin = await client.get(f"/books/{bad.id}", headers=auth_headers(admin_user))
    assert admin.json()["file_warning"] == WARNING_PDF_CONVERSION
