"""Поиск обложки книги в открытых каталогах по названию и автору.

Нужен книгам, у которых обложку не взять из файла: PDF под паролем или
повреждённый, EPUB без своей обложки. Сначала Open Library (обложки в
хорошем качестве), затем Google Books.

Найденную обложку берём, только если название в каталоге действительно
совпадает с нашим — иначе легко подставить обложку чужой книги с похожим
названием. Картинку проверяем: открывается, не крошечная, книжные пропорции.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from io import BytesIO

import httpx

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(10.0, connect=5.0)
USER_AGENT = "AegisLibrary/1.0 (cover lookup)"
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MIN_WIDTH = 150
# Высота / ширина у обложек — примерно от 1.1 до 1.9.
RATIO_RANGE = (1.1, 1.9)

OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json"
OPEN_LIBRARY_COVER = "https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"
GOOGLE_BOOKS_SEARCH = "https://www.googleapis.com/books/v1/volumes"


@dataclass
class FoundCover:
    image: bytes
    source: str


_WORD_RE = re.compile(r"[^\W_]+", re.UNICODE)


def _words(text: str) -> list[str]:
    text = (text or "").lower().replace("ё", "е")
    return [w for w in _WORD_RE.findall(text) if len(w) >= 3 or w.isdigit()]


def title_variants(title: str) -> list[str]:
    """Название целиком и без подзаголовка/издания: «Python. Погружение…»,
    «The C Programming Language, Second Edition» → «The C Programming Language»."""
    title = title or ""
    head = re.split(r"\s*[:—–|,(]\s*|\.\s", title, maxsplit=1)[0]
    variants = [title]
    if head != title and _words(head):
        variants.append(head)
    return variants


def main_title(title: str) -> str:
    """Название без подзаголовка — для запроса в каталог (длинный подзаголовок
    сужает поиск)."""
    variants = title_variants(title)
    return variants[-1] if len(_words(variants[-1])) >= 2 else variants[0]


# Доля значимых слов одного названия, которые есть в другом.
TITLE_COVERAGE_OURS = 0.75
TITLE_COVERAGE_THEIRS = 0.75


def title_matches(ours: str, theirs: str) -> bool:
    """Совпадает ли название из каталога с нашим. Проверяем в обе стороны:
    «Алгоритмы» ≠ «Алгоритмы на Java», «Head First Git» ≠ «Head First Python»."""
    for a_text in title_variants(ours):
        for b_text in title_variants(theirs):
            a, b = set(_words(a_text)), set(_words(b_text))
            if not a or not b:
                continue
            common = len(a & b)
            if common / len(a) >= TITLE_COVERAGE_OURS and common / len(b) >= TITLE_COVERAGE_THEIRS:
                return True
    return False


def valid_cover(image: bytes) -> bool:
    if not image or len(image) < 2048 or len(image) > MAX_IMAGE_BYTES:
        return False
    try:
        from PIL import Image

        with Image.open(BytesIO(image)) as img:
            img.verify()
        with Image.open(BytesIO(image)) as img:
            width, height = img.size
    except Exception:  # noqa: BLE001 — не картинка
        return False
    if width < MIN_WIDTH or not height:
        return False
    return RATIO_RANGE[0] <= height / width <= RATIO_RANGE[1]


async def _get_image(client: httpx.AsyncClient, url: str) -> bytes | None:
    try:
        r = await client.get(url)
    except httpx.HTTPError as e:
        logger.info("Обложка не скачалась (%s): %s", url, e)
        return None
    if r.status_code != 200 or not r.headers.get("content-type", "").startswith("image/"):
        return None
    return r.content if valid_cover(r.content) else None


async def _from_open_library(client: httpx.AsyncClient, title: str, author: str) -> FoundCover | None:
    params = {"title": main_title(title), "limit": 5, "fields": "title,cover_i"}
    if author:
        params["author"] = author.split(",")[0].strip()
    try:
        r = await client.get(OPEN_LIBRARY_SEARCH, params=params)
        docs = r.json().get("docs", []) if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError) as e:
        logger.info("Open Library недоступна: %s", e)
        return None
    for doc in docs:
        if doc.get("cover_i") and title_matches(title, doc.get("title", "")):
            image = await _get_image(client, OPEN_LIBRARY_COVER.format(cover_id=doc["cover_i"]))
            if image:
                return FoundCover(image, "Open Library")
    return None


def _google_image_url(links: dict) -> str | None:
    for key in ("extraLarge", "large", "medium", "small", "thumbnail"):
        url = links.get(key)
        if url:
            url = url.replace("http://", "https://").replace("&edge=curl", "")
            # Миниатюра Google Books по умолчанию ~128px; просим крупнее.
            return re.sub(r"zoom=\d", "zoom=0", url) + "&fife=w800"
    return None


async def _from_google_books(client: httpx.AsyncClient, title: str, author: str) -> FoundCover | None:
    query = f'intitle:"{main_title(title)}"'
    if author:
        query += f' inauthor:"{author.split(",")[0].strip()}"'
    try:
        r = await client.get(GOOGLE_BOOKS_SEARCH, params={"q": query, "maxResults": 5, "printType": "books"})
        items = r.json().get("items", []) if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError) as e:
        logger.info("Google Books недоступен: %s", e)
        return None
    for item in items:
        info = item.get("volumeInfo", {})
        url = _google_image_url(info.get("imageLinks") or {})
        if url and title_matches(title, info.get("title", "")):
            image = await _get_image(client, url)
            if image:
                return FoundCover(image, "Google Books")
    return None


async def lookup_cover(title: str, author: str | None) -> FoundCover | None:
    """Найти обложку по названию и автору. None — не нашли или каталоги
    недоступны (ошибки сети наружу не пробрасываем)."""
    if not _words(title or ""):
        return None
    async with httpx.AsyncClient(
        timeout=TIMEOUT, follow_redirects=True, headers={"User-Agent": USER_AGENT},
    ) as client:
        for source in (_from_open_library, _from_google_books):
            found = await source(client, title, author or "")
            if found:
                return found
    return None
