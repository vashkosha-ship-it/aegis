"""Найти книги, которые не открываются у читателей, и скрыть их.

Проверяет файлы уже загруженных книг тем же способом, что и индексация
новых (app/services/book_file_check): повреждённые и не полностью
загруженные файлы, PDF под паролем, EPUB с DRM, пропавшие из хранилища.

Чтобы не скачивать всю библиотеку, у каждого PDF сначала читаются только
начало и конец. Целиком скачиваются и проверяются лишь подозрительные
файлы (обрезанные, с пометкой о шифровании, не PDF внутри) и книги, у
которых не прошла индексация. Остальные книги уже открывались индексатором.

Без --apply только показывает список. С --apply помечает такие книги — они
пропадают у читателей, а в админке видны с причиной; книги, которые теперь
открываются (например, файл заменили), снова становятся видимыми.

Запуск из каталога backend (в фоне — переживёт обрыв SSH):
    nohup .venv/bin/python -m scripts.check_book_files --apply > /opt/aegis/check_books.txt 2>&1 &
    cat /opt/aegis/check_books.txt
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.config import settings
from app.core.storage import StorageBackend, StorageNotFound, get_storage
from app.db.session import AsyncSessionLocal
from app.models.book import Book
from app.services.book_file_check import (
    PROBLEM_MISSING,
    FileCheck,
    check_book_file,
)
from app.services.search_index import spool_to_tempfile

HEAD = 64 * 1024
TAIL = 256 * 1024

LABELS = {
    "damaged": "Файл повреждён или загружен не полностью",
    "password": "Защищён паролем или DRM",
    "missing": "Файла нет в хранилище",
}


def pdf_looks_suspicious(head: bytes, tail: bytes) -> bool:
    """Не PDF, обрезан или с пометкой о шифровании — нужна полная проверка."""
    if b"%PDF-" not in head[:1024]:
        return True
    return b"%%EOF" not in tail or b"/Encrypt" in head or b"/Encrypt" in tail


async def _read_range(storage: StorageBackend, key: str, start: int, end: int) -> bytes:
    return b"".join([c async for c in await storage.open_range(key, start, end)])


async def _full_check(storage: StorageBackend, key: str, file_format: str) -> FileCheck | None:
    suffix = ".epub" if file_format == "epub" else ".pdf"
    path = await spool_to_tempfile(await storage.open_stream(key), suffix=suffix)
    try:
        return await check_book_file(path, file_format)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


async def check_one(storage: StorageBackend, book) -> FileCheck | None:
    """Итог для одной книги; None — проверить не удалось или не нужно было."""
    key = book.epub_storage_key if book.file_format == "epub" else book.pdf_storage_key
    if not key:
        return None
    try:
        size = await storage.size(key)
    except StorageNotFound:
        return FileCheck(PROBLEM_MISSING, "Файл книги не найден в хранилище")

    needs_full = book.indexing_status == "failed" or bool(book.file_problem)
    if not needs_full and book.file_format != "epub" and size > 0:
        head = await _read_range(storage, key, 0, min(size, HEAD) - 1)
        tail = await _read_range(storage, key, max(0, size - TAIL), size - 1)
        needs_full = pdf_looks_suspicious(head, tail)
    if size == 0:
        return FileCheck("damaged", "Файл книги пустой")
    if not needs_full:
        return FileCheck(None)
    return await _full_check(storage, key, book.file_format)


async def run(storage: StorageBackend, *, apply: bool, progress=print) -> dict[str, list]:
    report: dict[str, list] = {problem: [] for problem in LABELS}
    report["restored"] = []
    async with AsyncSessionLocal() as db:
        books = (await db.scalars(
            select(Book)
            .where((Book.pdf_storage_key.is_not(None)) | (Book.epub_storage_key.is_not(None)))
            .order_by(Book.id)
        )).all()
        for n, book in enumerate(books, 1):
            if n % 250 == 0:
                progress(f"  … проверено {n} из {len(books)}")
            try:
                result = await check_one(storage, book)
            except Exception as exc:  # noqa: BLE001 — одна книга не останавливает проверку
                progress(f"  #{book.id}: не удалось проверить ({type(exc).__name__}: {exc})")
                continue
            if result is None:
                continue
            if result.problem:
                report[result.problem].append((book.id, book.title, result.detail))
            elif book.file_problem:
                report["restored"].append((book.id, book.title, ""))
            if apply and (result.problem != book.file_problem or result.problem):
                book.file_problem = result.problem
                book.file_problem_detail = result.detail or None
                book.file_checked_at = datetime.now(UTC)
                await db.commit()
    return report


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="скрыть найденные книги от читателей")
    args = parser.parse_args()

    logging.disable(logging.WARNING)
    print(f"Хранилище: {settings.STORAGE_BACKEND}", flush=True)
    report = await run(get_storage(), apply=args.apply, progress=lambda m: print(m, flush=True))

    hidden = 0
    for problem, label in LABELS.items():
        items = report[problem]
        hidden += len(items)
        print(f"\n{label}: {len(items)}")
        for book_id, title, detail in items:
            print(f"  #{book_id}: {title[:70]}")
    if report["restored"]:
        print(f"\nСнова открываются: {len(report['restored'])}")
        for book_id, title, _ in report["restored"]:
            print(f"  #{book_id}: {title[:70]}")

    if args.apply:
        print(f"\nСкрыто от читателей: {hidden}. В админке они отмечены «Скрыта».")
    else:
        print(f"\nНе открываются: {hidden}. Чтобы скрыть их от читателей, запустите с --apply.")
    print("Готово.")


if __name__ == "__main__":
    asyncio.run(main())
