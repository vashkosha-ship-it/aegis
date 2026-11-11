"""scripts/check_pdfs: распознаёт PDF под паролем, обрезанные, не PDF и пропавшие."""
from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace

from pypdf import PdfWriter

from app.core.storage import LocalStorage
from scripts import check_pdfs


def _pdf(user_password: str | None = None, owner_password: str = "owner") -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=300)
    if user_password is not None:
        writer.encrypt(user_password=user_password, owner_password=owner_password)
    buf = BytesIO()
    writer.write(buf)
    return buf.getvalue()


async def test_check_finds_problem_files(tmp_path):
    storage = LocalStorage(tmp_path)
    files = {
        "ok.pdf": _pdf(),
        "locked.pdf": _pdf(user_password="secret"),
        "owner-only.pdf": _pdf(user_password=""),   # открывается без пароля
        "truncated.pdf": _pdf()[:-200],
        "not-pdf.pdf": b"<html>not a pdf</html>" * 10,
    }
    for name, data in files.items():
        async def payload(data=data):
            yield data
        await storage.save_stream(f"books/pdf/{name}", payload(), 10 * 1024 * 1024)
    names = [*files, "missing.pdf"]
    rows = [SimpleNamespace(id=i, title=n, pdf_storage_key=f"books/pdf/{n}") for i, n in enumerate(names, 1)]

    report = await check_pdfs.check(storage, rows, progress=lambda m: None)
    titles = {k: [r.title for r in v] for k, v in report.items()}
    assert titles["locked"] == ["locked.pdf"]
    assert titles["truncated"] == ["truncated.pdf"]
    assert titles["not_pdf"] == ["not-pdf.pdf"]
    assert titles["missing"] == ["missing.pdf"]
