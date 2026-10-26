"""Отпечаток файла книги для кэша на устройстве (file_version)."""

from types import SimpleNamespace

from app.services.books import file_version


def _book(pdf=None, epub=None, fmt="pdf"):
    return SimpleNamespace(pdf_storage_key=pdf, epub_storage_key=epub, file_format=fmt)


def test_no_file_no_version():
    assert file_version(_book()) is None


def test_version_is_stable_and_hides_storage_key():
    key = "books/pdf/0123456789abcdef.pdf"
    version = file_version(_book(pdf=key))
    assert version == file_version(_book(pdf=key))
    assert len(version) == 16
    assert "books" not in version and "pdf" not in version


def test_new_upload_changes_version():
    old = file_version(_book(pdf="books/pdf/aaa.pdf"))
    new = file_version(_book(pdf="books/pdf/bbb.pdf"))
    assert old != new


def test_epub_book_uses_epub_key():
    book = _book(pdf="books/pdf/old.pdf", epub="books/epub/new.epub", fmt="epub")
    assert file_version(book) == file_version(_book(epub="books/epub/new.epub", fmt="epub"))
