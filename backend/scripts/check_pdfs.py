"""Проверить PDF-книги: под паролем, обрезанные, не PDF внутри, без файла.

Такие книги, скорее всего, не открываются у читателей, и обложку из первой
страницы для них не создать. Скрипт только читает файлы и ничего не меняет.
Работает с любым хранилищем (локальным и S3): целиком файлы не скачивает —
смотрит начало и конец; полностью скачиваются только файлы с пометкой о
шифровании, чтобы проверить, открываются ли они без пароля (PDF, защищённые
лишь от редактирования и печати, читаются нормально и в список не попадают).

Запуск из каталога backend (в фоне — переживёт обрыв SSH):
    nohup .venv/bin/python -m scripts.check_pdfs > /opt/aegis/check_pdfs.txt 2>&1 &
    cat /opt/aegis/check_pdfs.txt
"""
from __future__ import annotations

import asyncio
import logging
import tempfile

from sqlalchemy import text

from app.core.config import settings
from app.core.storage import StorageBackend, get_storage
from app.db.session import engine

HEAD = 64 * 1024
TAIL = 256 * 1024


def classify(head: bytes, tail: bytes) -> tuple[bool, bool, bool]:
    """(это PDF, файл обрезан, есть пометка о шифровании) по началу и концу."""
    is_pdf = b"%PDF-" in head[:1024]
    truncated = is_pdf and b"%%EOF" not in tail
    encrypted = is_pdf and (b"/Encrypt" in head or b"/Encrypt" in tail)
    return is_pdf, truncated, encrypted


async def _read_range(storage: StorageBackend, key: str, start: int, end: int) -> bytes:
    return b"".join([c async for c in await storage.open_range(key, start, end)])


async def opens_without_password(storage: StorageBackend, key: str) -> bool:
    from pypdf import PdfReader

    with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
        async for chunk in await storage.open_stream(key):
            tmp.write(chunk)
        tmp.flush()
        try:
            reader = PdfReader(tmp.name, strict=False)
            return not reader.is_encrypted or bool(reader.decrypt(""))
        except Exception:  # noqa: BLE001 — не открылся без пароля
            return False


async def check(storage: StorageBackend, rows, progress=print) -> dict[str, list]:
    report: dict[str, list] = {"locked": [], "truncated": [], "not_pdf": [], "missing": []}
    for n, row in enumerate(rows, 1):
        if n % 250 == 0:
            progress(f"  … проверено {n} из {len(rows)}")
        key = row.pdf_storage_key
        try:
            size = await storage.size(key)
            head = await _read_range(storage, key, 0, min(size, HEAD) - 1)
            tail = await _read_range(storage, key, max(0, size - TAIL), size - 1)
        except Exception:  # noqa: BLE001 — нет файла или не читается
            report["missing"].append(row)
            continue
        is_pdf, truncated, encrypted = classify(head, tail)
        if not is_pdf:
            report["not_pdf"].append(row)
            continue
        if truncated:
            report["truncated"].append(row)
        if encrypted and not await opens_without_password(storage, key):
            report["locked"].append(row)
    return report


async def main() -> None:
    logging.disable(logging.WARNING)
    print(f"Хранилище: {settings.STORAGE_BACKEND}", flush=True)
    async with engine.connect() as conn:
        rows = (await conn.execute(text(
            "SELECT id, title, pdf_storage_key FROM books "
            "WHERE pdf_storage_key IS NOT NULL ORDER BY id"
        ))).all()
    report = await check(get_storage(), rows, progress=lambda m: print(m, flush=True))

    def show(title: str, items: list) -> None:
        print(f"\n{title}: {len(items)}")
        for row in items:
            print(f"  #{row.id}: {row.title[:70]}")

    print(f"\nPDF-книг: {len(rows)}")
    show("Под паролем (не открываются)", report["locked"])
    show("Файл обрезан (скорее всего повреждён)", report["truncated"])
    show("Не PDF внутри", report["not_pdf"])
    show("Файла нет в хранилище", report["missing"])
    print("\nГотово.")


if __name__ == "__main__":
    asyncio.run(main())
