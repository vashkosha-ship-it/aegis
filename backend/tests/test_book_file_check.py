"""Проверка «откроется ли файл у читателя» и скрытие таких книг."""
from __future__ import annotations

import io
import zipfile

import pytest
from pypdf import PdfWriter

from app.core.storage import LocalStorage
from app.models.book import Book
from app.models.library import MyListEntry, MyListStatus
from app.services.book_file_check import check_book_file
from scripts import check_book_files
from tests.conftest import auth_headers


def _pdf(user_password: str | None = None) -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=300)
    if user_password is not None:
        writer.encrypt(user_password=user_password, owner_password="owner")
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _epub(*, encryption: str | None = None, chapter: bool = True) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("mimetype", "application/epub+zip")
        z.writestr(
            "META-INF/container.xml",
            '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>'
            '<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'
            "</rootfiles></container>",
        )
        z.writestr(
            "OEBPS/content.opf",
            '<package xmlns="http://www.idpf.org/2007/opf"><manifest>'
            '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>'
            '</manifest><spine><itemref idref="c1"/></spine></package>',
        )
        if chapter:
            z.writestr("OEBPS/ch1.xhtml", "<html><body><p>Глава</p></body></html>")
        if encryption:
            z.writestr(
                "META-INF/encryption.xml",
                '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" '
                'xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData>'
                f'<enc:EncryptionMethod Algorithm="{encryption}"/></enc:EncryptedData></encryption>',
            )
    return buf.getvalue()


async def _check(tmp_path, name: str, data: bytes, fmt: str):
    path = tmp_path / name
    path.write_bytes(data)
    return await check_book_file(str(path), fmt)


@pytest.mark.asyncio
async def test_pdf_checks(tmp_path):
    assert (await _check(tmp_path, "ok.pdf", _pdf(), "pdf")).ok
    # Защита только от печати/редактирования — читается.
    assert (await _check(tmp_path, "owner.pdf", _pdf(user_password=""), "pdf")).ok
    # Обрезан вместе с трейлером — не открывает ни PDFium, ни pypdf.
    cut = await _check(tmp_path, "cut.pdf", _pdf()[:-120], "pdf")
    assert cut.problem == "damaged"

    locked = await _check(tmp_path, "locked.pdf", _pdf(user_password="secret"), "pdf")
    assert locked.problem == "password"
    garbage = await _check(tmp_path, "broken.pdf", b"%PDF-1.7\n" + b"\x00\xff" * 4000, "pdf")
    assert garbage.problem == "damaged"
    not_pdf = await _check(tmp_path, "html.pdf", b"<html>not a pdf</html>" * 50, "pdf")
    assert not_pdf.problem == "damaged"


@pytest.mark.asyncio
async def test_epub_checks(tmp_path):
    assert (await _check(tmp_path, "ok.epub", _epub(), "epub")).ok
    fonts = _epub(encryption="http://www.idpf.org/2008/embedding")
    assert (await _check(tmp_path, "fonts.epub", fonts, "epub")).ok

    drm = await _check(tmp_path, "drm.epub", _epub(encryption="http://www.w3.org/2001/04/xmlenc#aes128-cbc"), "epub")
    assert drm.problem == "password"
    cut = await _check(tmp_path, "cut.epub", _epub()[:300], "epub")
    assert cut.problem == "damaged"
    empty = await _check(tmp_path, "nochapter.epub", _epub(chapter=False), "epub")
    assert empty.problem == "damaged"


async def _books(db):
    ok = Book(title="Открывается", author="А", pdf_storage_key="books/pdf/ok.pdf")
    broken = Book(
        title="Битая", author="А", pdf_storage_key="books/pdf/broken.pdf",
        file_problem="damaged", file_problem_detail="PDF повреждён",
    )
    nofile = Book(title="Без файла", author="А")
    db.add_all([ok, broken, nofile])
    await db.commit()
    return ok, broken, nofile


@pytest.mark.asyncio
async def test_reader_does_not_see_unopenable_books(client, db, approved_user, admin_user):
    ok, broken, nofile = await _books(db)
    db.add(MyListEntry(user_id=approved_user.id, book_id=broken.id, status=MyListStatus.READING))
    await db.commit()
    reader, admin = auth_headers(approved_user), auth_headers(admin_user)

    listed = (await client.get("/books?per_page=100", headers=reader)).json()
    assert [b["id"] for b in listed["items"]] == [ok.id]
    assert listed["total"] == 1
    for book in (broken, nofile):
        assert (await client.get(f"/books/{book.id}", headers=reader)).status_code == 404
    assert (await client.get(f"/books/{broken.id}/pdf", headers=reader)).status_code == 404
    assert (await client.put(
        f"/books/{broken.id}/mylist", json={"status": "planned"}, headers=reader,
    )).status_code == 404
    assert (await client.get("/me/mylist", headers=reader)).json() == []

    # Админ видит всё — и причину.
    admin_list = (await client.get("/books?per_page=100", headers=admin)).json()
    assert {b["id"] for b in admin_list["items"]} == {ok.id, broken.id, nofile.id}
    card = (await client.get(f"/books/{broken.id}", headers=admin)).json()
    assert card["file_problem"] == "damaged"
    assert card["file_problem_detail"] == "PDF повреждён"


@pytest.mark.asyncio
async def test_new_file_clears_problem(db):
    from app.api.books import _clear_book_index

    _, broken, _ = await _books(db)
    await _clear_book_index(db, broken)
    assert broken.file_problem is None
    assert broken.file_problem_detail is None


@pytest.mark.asyncio
async def test_script_marks_and_restores(tmp_path, db, monkeypatch):
    storage = LocalStorage(tmp_path)
    files = {
        "ok.pdf": _pdf(),
        "locked.pdf": _pdf(user_password="secret"),
        "garbage.pdf": b"%PDF-1.7\n" + b"\x00\xff" * 4000,
    }
    for name, data in files.items():
        async def payload(data=data):
            yield data
        await storage.save_stream(f"books/pdf/{name}", payload(), 10 * 1024 * 1024)
    ok = Book(title="ok", author="А", pdf_storage_key="books/pdf/ok.pdf",
              file_problem="damaged")  # файл заменили — снова открывается
    locked = Book(title="locked", author="А", pdf_storage_key="books/pdf/locked.pdf")
    garbage = Book(title="garbage", author="А", pdf_storage_key="books/pdf/garbage.pdf")
    missing = Book(title="missing", author="А", pdf_storage_key="books/pdf/missing.pdf")
    db.add_all([ok, locked, garbage, missing])
    await db.commit()

    class Session:
        async def __aenter__(self):
            return db

        async def __aexit__(self, *_):
            return False

    monkeypatch.setattr(check_book_files, "AsyncSessionLocal", Session)
    report = await check_book_files.run(storage, apply=True, progress=lambda m: None)

    titles = {k: [t for _, t, _ in v] for k, v in report.items()}
    assert titles["password"] == ["locked"]
    assert titles["damaged"] == ["garbage"]
    assert titles["missing"] == ["missing"]
    assert titles["restored"] == ["ok"]
    for book in (ok, locked, garbage, missing):
        await db.refresh(book)
    assert ok.file_problem is None
    assert (locked.file_problem, garbage.file_problem, missing.file_problem) == (
        "password", "damaged", "missing",
    )


def test_suspicious_pdf_detection():
    pdf = _pdf()
    assert not check_book_files.pdf_looks_suspicious(pdf[:1024], pdf[-1024:])
    assert check_book_files.pdf_looks_suspicious(pdf[:1024], pdf[-1024:-200])
    assert check_book_files.pdf_looks_suspicious(b"<html>", b"</html>")
    locked = _pdf(user_password="x")
    assert check_book_files.pdf_looks_suspicious(locked[:65536], locked[-262144:])


def test_labels_cover_all_problems():
    from app.services.book_file_check import PROBLEMS

    assert set(PROBLEMS) == set(check_book_files.LABELS)


@pytest.mark.asyncio
async def test_search_hides_unopenable_books_from_readers(client, db, approved_user, admin_user):
    from tests.test_search_content import _add_search_columns

    await _add_search_columns(db)
    ok = Book(title="Криптография ok", author="А", pdf_storage_key="books/pdf/c1.pdf")
    broken = Book(title="Криптография битая", author="А", pdf_storage_key="books/pdf/c2.pdf",
                  file_problem="password")
    db.add_all([ok, broken])
    await db.commit()

    def ids(response):
        return {hit["book_id"] for hit in response.json()["hits"]}

    reader = await client.get("/search?q=Криптография", headers=auth_headers(approved_user))
    assert ids(reader) == {ok.id}
    admin = await client.get("/search?q=Криптография", headers=auth_headers(admin_user))
    assert ids(admin) == {ok.id, broken.id}
