"""Изолированные данные для критических E2E в CI.

Скрипт намеренно отказывается работать вне DEBUG и с удалённой БД. Он создаёт
только временные аккаунты/книги в чистой базе GitHub Actions; production seed
и боевые данные не затрагиваются.
"""
from __future__ import annotations

import asyncio
import io
import os
import zipfile
from pathlib import Path

from reportlab.pdfgen import canvas
from sqlalchemy import delete
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.core.security import hash_new_password, hash_recovery_code
from app.db.session import AsyncSessionLocal
from app.models.book import Book
from app.models.book_page import BookPage
from app.models.user import User, UserRole

E2E_TITLES = ("E2E PDF Smoke", "E2E EPUB Smoke")
E2E_USERNAMES = ("e2e_reader", "e2e_account", "e2e_admin")


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Не задана обязательная переменная {name}")
    return value


def _guard_local_ci() -> None:
    if os.environ.get("AEGIS_E2E_SEED") != "local-ci-only":
        raise RuntimeError("E2E seed требует AEGIS_E2E_SEED=local-ci-only")
    if not settings.DEBUG:
        raise RuntimeError("E2E seed запрещён при DEBUG=false")
    host = (make_url(settings.DATABASE_URL).host or "").lower()
    if host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError(f"E2E seed запрещён для удалённой БД: host={host!r}")


def _pdf_bytes() -> bytes:
    output = io.BytesIO()
    document = canvas.Canvas(output)
    document.setTitle("Aegis E2E PDF")
    document.drawString(72, 760, "Aegis critical PDF smoke page one")
    document.drawString(72, 730, "search-marker-cobalt")
    document.showPage()
    document.drawString(72, 760, "Aegis critical PDF smoke page two")
    document.save()
    return output.getvalue()


def _epub_bytes() -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr(
            "mimetype",
            "application/epub+zip",
            compress_type=zipfile.ZIP_STORED,
        )
        archive.writestr(
            "META-INF/container.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>""",
        )
        archive.writestr(
            "OEBPS/content.opf",
            """<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">aegis-e2e-epub</dc:identifier>
    <dc:title>Aegis E2E EPUB</dc:title><dc:language>ru</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="chapter1"/><itemref idref="chapter2"/></spine>
</package>""",
        )
        archive.writestr(
            "OEBPS/nav.xhtml",
            """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Оглавление</title></head><body><nav epub:type="toc"><ol>
<li><a href="chapter1.xhtml">Глава 1</a></li><li><a href="chapter2.xhtml">Глава 2</a></li>
</ol></nav></body></html>""",
        )
        for number in (1, 2):
            paragraph = (f"Aegis EPUB position marker {number}. " * 80).strip()
            archive.writestr(
                f"OEBPS/chapter{number}.xhtml",
                f"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Глава {number}</title></head>
<body><h1>Глава {number}</h1><p>{paragraph}</p></body></html>""",
            )
    return output.getvalue()


def _write_fixture(path: Path, payload: bytes) -> str:
    root = Path(settings.STORAGE_LOCAL_PATH).resolve()
    target = (root / path).resolve()
    if not target.is_relative_to(root):
        raise RuntimeError("E2E fixture вышла за пределы STORAGE_LOCAL_PATH")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(payload)
    return path.as_posix()


async def seed() -> None:
    _guard_local_ci()
    reader_password = _required("E2E_PASSWORD")
    account_password = _required("E2E_ACCOUNT_PASSWORD")
    admin_password = _required("E2E_ADMIN_PASSWORD")
    recovery_code = _required("E2E_ADMIN_RECOVERY_CODE")

    pdf_key = _write_fixture(Path("books/pdf/e2e-smoke.pdf"), _pdf_bytes())
    epub_key = _write_fixture(Path("books/epub/e2e-smoke.epub"), _epub_bytes())

    async with AsyncSessionLocal() as db:
        await db.execute(delete(User).where(User.username.in_(E2E_USERNAMES)))
        await db.execute(delete(Book).where(Book.title.in_(E2E_TITLES)))
        await db.flush()

        db.add_all(
            [
                User(
                    username="e2e_reader",
                    email="reader@e2e.invalid",
                    password_hash=hash_new_password(reader_password),
                    full_name="E2E Reader",
                    role=UserRole.READER,
                    is_verified=True,
                    is_approved=True,
                ),
                User(
                    username="e2e_account",
                    email="account@e2e.invalid",
                    password_hash=hash_new_password(account_password),
                    full_name="E2E Account",
                    role=UserRole.READER,
                    is_verified=True,
                    is_approved=True,
                ),
                User(
                    username="e2e_admin",
                    email="admin@e2e.invalid",
                    password_hash=hash_new_password(admin_password),
                    full_name="E2E Administrator",
                    role=UserRole.ADMIN,
                    is_verified=True,
                    is_approved=True,
                    admin_recovery_codes=[hash_recovery_code(recovery_code)],
                ),
            ]
        )

        pdf_book = Book(
            title=E2E_TITLES[0],
            author="Aegis CI",
            description="Двухстраничная PDF-фикстура критического E2E.",
            icon="📘",
            pdf_storage_key=pdf_key,
            file_format="pdf",
            total_pages=2,
            indexing_status="succeeded",
            indexed_sections=2,
        )
        epub_book = Book(
            title=E2E_TITLES[1],
            author="Aegis CI",
            description="Двухглавная EPUB-фикстура критического E2E.",
            icon="📗",
            epub_storage_key=epub_key,
            file_format="epub",
            total_pages=2,
            indexing_status="succeeded",
            indexed_sections=2,
        )
        db.add_all([pdf_book, epub_book])
        await db.flush()
        db.add_all(
            [
                BookPage(
                    book_id=pdf_book.id,
                    page=1,
                    content="Aegis critical PDF search marker cobalt",
                ),
                BookPage(
                    book_id=pdf_book.id,
                    page=2,
                    content="Aegis critical PDF second page",
                ),
                BookPage(
                    book_id=epub_book.id,
                    page=1,
                    content="Aegis EPUB position marker chapter one",
                ),
                BookPage(
                    book_id=epub_book.id,
                    page=2,
                    content="Aegis EPUB position marker chapter two",
                ),
            ]
        )
        await db.commit()

    print("E2E fixtures created: 3 users, 2 books")


if __name__ == "__main__":
    asyncio.run(seed())
