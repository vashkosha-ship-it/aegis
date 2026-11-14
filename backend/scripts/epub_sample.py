"""Показать, как фраза записана внутри EPUB-файла книги (для разбора вёрстки).

Ищет фразу в главах книги и печатает исходный код вокруг неё, а также
стили и шрифты, на которые глава ссылается. Ничего не меняет.

Запуск из каталога backend:
    .venv/bin/python -m scripts.epub_sample 3669 "Европол" > /opt/aegis/epub_sample.txt
    cat /opt/aegis/epub_sample.txt
"""
from __future__ import annotations

import argparse
import asyncio
import os
import posixpath
import re
import unicodedata
import zipfile

from app.core.storage import get_storage
from app.db.session import AsyncSessionLocal
from app.models.book import Book
from app.services.search_index import spool_to_tempfile

CONTEXT = 900


def visible(text: str) -> str:
    """Невидимые символы — подписью: мягкий перенос, неразрывный пробел и т.п."""
    out = []
    for ch in text:
        if ch in "\n\t" or ch.isprintable() and not unicodedata.category(ch).startswith("C") and ch not in "     ":
            out.append(ch)
        else:
            out.append(f"[U+{ord(ch):04X}]")
    return "".join(out)


def loose_pattern(phrase: str) -> re.Pattern:
    # Между буквами может стоять что угодно короткое: тег, перенос, пробел.
    parts = [re.escape(ch) for ch in phrase if not ch.isspace()]
    return re.compile(r"(?:<[^>]{0,200}>|&[#a-zA-Z0-9]{1,10};|\s|[­​ ])*".join(parts), re.S)


def sample(path: str, phrase: str) -> None:
    pattern = loose_pattern(phrase)
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        print(f"Файлов в архиве: {len(names)}")
        opf = next((n for n in names if n.endswith(".opf")), None)
        if opf:
            text = z.read(opf).decode("utf-8", "replace")
            meta = re.findall(r"<meta[^>]*(?:rendition|layout|spread|fixed)[^>]*>(?:[^<]*</meta>)?", text)
            print("Метаданные вёрстки:", meta or "нет (обычная перекладываемая книга)")
        for name in names:
            if not name.lower().endswith((".xhtml", ".html", ".htm")):
                continue
            text = z.read(name).decode("utf-8", "replace")
            match = pattern.search(text)
            if not match:
                continue
            print(f"\n=== Глава: {name} ({len(text)} символов) ===")
            head = re.search(r"<head.*?</head>", text, re.S)
            if head:
                print("--- <head> ---")
                print(visible(head.group(0)[:2500]))
            start = max(0, match.start() - CONTEXT // 3)
            print("--- вокруг фразы ---")
            print(visible(text[start:match.end() + CONTEXT]))
            base = posixpath.dirname(name)
            for href in re.findall(r'<link[^>]+href="([^"]+\.css)"', text)[:3]:
                css_name = posixpath.normpath(posixpath.join(base, href))
                if css_name in names:
                    css = z.read(css_name).decode("utf-8", "replace")
                    print(f"--- стиль {css_name} ({len(css)} символов), начало ---")
                    print(visible(css[:2500]))
            return
        print(f"Фраза «{phrase}» не найдена ни в одной главе.")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("book_id", type=int)
    parser.add_argument("phrase")
    args = parser.parse_args()
    async with AsyncSessionLocal() as db:
        book = await db.get(Book, args.book_id)
    if not book or not book.epub_storage_key:
        print("У книги нет EPUB-файла")
        return
    print(f"Книга #{book.id}: {book.title}")
    storage = get_storage()
    path = await spool_to_tempfile(await storage.open_stream(book.epub_storage_key), suffix=".epub")
    try:
        sample(path, args.phrase)
    finally:
        os.unlink(path)


if __name__ == "__main__":
    asyncio.run(main())
