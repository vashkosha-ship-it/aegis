"""Найти EPUB, перегнанные из PDF (pdftohtml), и пометить их в админке.

У таких книг испорчен сам текст: на месте бывших переносов — пробелы
(«Ев ропол сооб щил»), каждая строка колонки — отдельный абзац. Книги
остаются видимыми; админ видит пометку «Перегнана из PDF» и фильтр, чтобы
заменить файл (лучше — оригинальным PDF).

Файлы целиком не скачиваются: читаются только оглавление архива и начало
нескольких глав — это несколько небольших запросов к хранилищу на книгу.

Без --apply только показывает список. С --apply ставит пометку (и снимает
её с книг, у которых файл уже заменили).

Запуск из каталога backend:
    .venv/bin/python -m scripts.find_pdf_converted_epubs --apply > /opt/aegis/pdf_epubs.txt 2>&1
    cat /opt/aegis/pdf_epubs.txt
"""
from __future__ import annotations

import argparse
import asyncio
import io
import logging
import zipfile

from sqlalchemy import select

from app.core.config import settings
from app.core.storage import StorageBackend, StorageNotFound, get_storage
from app.db.session import AsyncSessionLocal
from app.models.book import Book
from app.services.book_file_check import epub_conversion_warning

BLOCK = 256 * 1024
MAX_ROUNDS = 40


class NeedBytes(Exception):
    def __init__(self, start: int, end: int) -> None:
        super().__init__(start, end)
        self.start, self.end = start, end


class SparseFile(io.RawIOBase):
    """Файл, от которого скачаны только отдельные куски.

    zipfile читает его как обычный файл; если нужен кусок, которого ещё
    нет, бросается NeedBytes — снаружи его докачивают и повторяют разбор.
    """

    def __init__(self, size: int) -> None:
        self.size = size
        self.blocks: dict[int, bytes] = {}
        self.pos = 0

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.pos

    def seek(self, offset: int, whence: int = 0) -> int:
        base = {0: 0, 1: self.pos, 2: self.size}[whence]
        self.pos = max(0, min(self.size, base + offset))
        return self.pos

    def read(self, n: int = -1) -> bytes:
        if n is None or n < 0:
            n = self.size - self.pos
        end = min(self.size, self.pos + n)
        out = bytearray()
        pos = self.pos
        while pos < end:
            index = pos // BLOCK
            block = self.blocks.get(index)
            if block is None:
                missing_end = end
                raise NeedBytes(index * BLOCK, min(self.size, ((missing_end - 1) // BLOCK + 1) * BLOCK) - 1)
            offset = pos - index * BLOCK
            take = min(len(block) - offset, end - pos)
            out += block[offset:offset + take]
            pos += take
        self.pos = end
        return bytes(out)

    def readinto(self, buffer) -> int:
        data = self.read(len(buffer))
        buffer[:len(data)] = data
        return len(data)

    def put(self, start: int, data: bytes) -> None:
        for i in range(0, len(data), BLOCK):
            self.blocks[(start + i) // BLOCK] = data[i:i + BLOCK]


async def check_epub(storage: StorageBackend, key: str) -> str | None:
    size = await storage.size(key)
    sparse = SparseFile(size)
    for _ in range(MAX_ROUNDS):
        try:
            sparse.seek(0)
            with zipfile.ZipFile(sparse) as archive:
                return epub_conversion_warning(archive)
        except NeedBytes as need:
            data = b"".join([c async for c in await storage.open_range(key, need.start, need.end)])
            sparse.put(need.start, data)
    raise RuntimeError("слишком много запросов к файлу")


async def run(storage: StorageBackend, *, apply: bool, progress=print) -> dict[str, list]:
    report: dict[str, list] = {"converted": [], "cleared": [], "errors": []}
    async with AsyncSessionLocal() as db:
        books = (await db.scalars(
            select(Book).where(Book.epub_storage_key.is_not(None)).order_by(Book.id)
        )).all()
        progress(f"EPUB-книг: {len(books)}")
        for n, book in enumerate(books, 1):
            if n % 100 == 0:
                progress(f"  … проверено {n} из {len(books)}")
            try:
                warning = await check_epub(storage, book.epub_storage_key)
            except (StorageNotFound, zipfile.BadZipFile, RuntimeError, OSError) as exc:
                report["errors"].append((book.id, book.title, f"{type(exc).__name__}: {exc}"))
                continue
            if warning:
                report["converted"].append((book.id, book.title))
            elif book.file_warning:
                report["cleared"].append((book.id, book.title))
            if apply and book.file_warning != warning:
                book.file_warning = warning
                await db.commit()
    return report


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="пометить найденные книги в админке")
    args = parser.parse_args()
    logging.disable(logging.WARNING)
    print(f"Хранилище: {settings.STORAGE_BACKEND}", flush=True)
    report = await run(get_storage(), apply=args.apply, progress=lambda m: print(m, flush=True))

    print(f"\nПерегнаны из PDF (текст с разрывами): {len(report['converted'])}")
    for book_id, title in report["converted"]:
        print(f"  #{book_id}: {title[:70]}")
    if report["cleared"]:
        print(f"\nФайл уже заменён, пометка снята: {len(report['cleared'])}")
        for book_id, title in report["cleared"]:
            print(f"  #{book_id}: {title[:70]}")
    if report["errors"]:
        print(f"\nНе удалось проверить: {len(report['errors'])}")
        for book_id, title, error in report["errors"]:
            print(f"  #{book_id}: {title[:60]} — {error[:80]}")
    if args.apply:
        print(f"\nПомечено в админке: {len(report['converted'])} (фильтр «Перегнаны из PDF»).")
    else:
        print("\nЧтобы пометить их в админке, запустите с --apply.")
    print("Готово.")


if __name__ == "__main__":
    asyncio.run(main())
