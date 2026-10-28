"""Поиск и объединение книг-дубликатов.

Одна и та же книга попадает в каталог дважды по-разному: другой файл (скан,
другая сборка PDF), авторы в другом порядке («Рао, Макмахан» / «Макмахан,
Рао»), подзаголовок есть у одной копии, «2-е изд.» вместо «2-е издание»,
латинская «C» в русском слове. Простое сравнение названий этого не ловит.

Правила подобраны по живому каталогу так, чтобы не склеивать разные книги:
разные издания и тома (числа в названии не совпадают) дублями не считаются,
а для «похожих» названий нужно ещё совпадение числа страниц.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.models.book_comment import BookComment
from app.models.collection import collection_books
from app.models.library import Annotation, MyListEntry, ReadingProgress, Review
from app.models.quiz import QuizAttempt
from app.models.quiz_session import QuizSession
from app.models.team import ReadingAssignment

Confidence = Literal["certain", "likely"]

# Латинские буквы, неотличимые от кириллических. Встречаются в названиях,
# набранных вперемешку («Экстремальный Cи»).
_LAT_TO_CYR = str.maketrans("aceopxykmhtb", "асеорхукмнтв")
_CYR = re.compile(r"[а-я]")
_LAT = re.compile(r"[a-z]")

_ORDINALS = {
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6,
    "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10,
    "первое": 1, "второе": 2, "третье": 3, "четвертое": 4, "пятое": 5,
    "шестое": 6, "седьмое": 7, "восьмое": 8,
}
_ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7, "viii": 8, "ix": 9, "x": 10}
_EDITION_WORDS = {"edition", "ed", "изд", "издание", "издания", "редакция"}
_VOLUME_WORDS = {"том", "т", "часть", "ч", "vol", "volume", "part", "book", "книга", "выпуск"}
# Слова, которые ничего не говорят о книге: при сравнении их выбрасываем.
_NOISE = {
    "и", "в", "на", "с", "по", "для", "the", "a", "an", "of", "and", "to", "in", "for", "with", "on",
    "е", "ое", "й", "st", "nd", "rd", "th", "revised", "updated", "переработанное", "дополненное",
    "исправленное", "global", "international",
}
_JUNK_AUTHORS = {"", "автор не указан", "неизвестен", "неизвестный автор", "unknown", "anonymous", "n a"}

PAGES_TOLERANCE = 0.03


def _fold(word: str) -> str:
    if _CYR.search(word) and _LAT.search(word):
        return word.translate(_LAT_TO_CYR)
    return word


def _words(text: str) -> list[str]:
    text = (text or "").lower().replace("ё", "е")
    # «2-е», «3rd», «1st» — отделяем число от суффикса, чтобы видеть номер.
    text = re.sub(r"(\d+)(st|nd|rd|th|е|ое|й)\b", r"\1 \2", text)
    cleaned = "".join(ch if ch.isalnum() else " " for ch in text)
    return [_fold(w) for w in cleaned.split()]


@dataclass(frozen=True)
class TitleKey:
    words: tuple[str, ...]  # значимые слова названия без пометок об издании/томе
    main: tuple[str, ...]  # то же, но только до двоеточия/точки (без подзаголовка)
    edition: int  # 1 — первое или не указано
    volume: int | None
    numbers: frozenset[str]  # прочие числа: год, версия («2.0», «2018»)

    @property
    def ident(self) -> tuple:
        """Всё, что определяет книгу; подзаголовок уже входит в ``words``."""
        return (self.words, self.edition, self.volume, self.numbers)


def title_key(title: str) -> TitleKey:
    main_part = re.split(r"[:.(\[—–]| - ", title or "", maxsplit=1)[0]
    words = _words(title)
    edition, volume = 1, None
    numbers: set[str] = set()
    kept: list[str] = []
    for i, word in enumerate(words):
        prev = words[i - 1] if i else ""
        nxt = words[i + 1] if i + 1 < len(words) else ""
        nxt2 = words[i + 2] if i + 2 < len(words) else ""
        value = int(word) if word.isdigit() else _ORDINALS.get(word)
        if word in _EDITION_WORDS or word in _VOLUME_WORDS or word in _NOISE:
            continue
        if value is not None and (nxt in _EDITION_WORDS or nxt2 in _EDITION_WORDS):
            edition = value
            continue
        if prev in _EDITION_WORDS and value is not None:
            edition = value
            continue
        if prev in _VOLUME_WORDS and (value is not None or word in _ROMAN):
            volume = value if value is not None else _ROMAN[word]
            continue
        if word.isdigit():
            numbers.add(word)
            continue
        if word in _ROMAN and prev in {"часть", "том"}:
            continue
        kept.append(word)
    skip = _NOISE | _EDITION_WORDS | _VOLUME_WORDS | set(_ORDINALS)
    main_words = [w for w in _words(main_part) if w not in skip and not w.isdigit()]
    return TitleKey(tuple(kept), tuple(main_words), edition, volume, frozenset(numbers))


def author_tokens(author: str) -> frozenset[str]:
    """Фамилии и имена всех авторов одним множеством — порядок не важен."""
    text = (author or "").lower().replace("ё", "е").strip()
    if " ".join(_words(text)) in _JUNK_AUTHORS:
        return frozenset()
    return frozenset(w for w in _words(text) if len(w) >= 3)


def authors_compatible(a: frozenset[str], b: frozenset[str]) -> bool:
    """Авторы совпадают с точностью до порядка, инициалов и формы записи.

    Пустой автор («Автор не указан») ни с кем не конфликтует.
    """
    if not a or not b:
        return True
    return bool(a & b)


def _pages_close(a: int, b: int) -> bool:
    if not a or not b:
        return False
    return abs(a - b) <= max(2, round(max(a, b) * PAGES_TOLERANCE))


def _jaccard(a: tuple[str, ...], b: tuple[str, ...]) -> float:
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _is_prefix(a: tuple[str, ...], b: tuple[str, ...]) -> bool:
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    return len(short) >= 2 and long_[: len(short)] == short


def compare(a: Book, b: Book, ka: TitleKey, kb: TitleKey) -> tuple[Confidence, str] | None:
    """Решение по паре книг: дубль (и насколько уверенно) или нет."""
    if a.file_sha256 and a.file_sha256 == b.file_sha256:
        return "certain", "Один и тот же файл"
    if (ka.edition, ka.volume, ka.numbers) != (kb.edition, kb.volume, kb.numbers):
        return None  # другое издание, том, год или версия
    aa, ab = author_tokens(a.author), author_tokens(b.author)
    compatible = authors_compatible(aa, ab)
    pages_close = _pages_close(a.total_pages or 0, b.total_pages or 0)
    if ka.words and ka.words == kb.words:
        if compatible:
            reason = "Совпадают название и авторы"
            if aa and aa == ab and author_order(a.author) != author_order(b.author):
                reason = "Совпадает название, авторы в другом порядке"
            return "certain", reason
        if pages_close:
            return "certain", "Совпадают название и число страниц"
        return None
    similar = (
        (len(ka.main) >= 2 and ka.main == kb.main)
        or _is_prefix(ka.words, kb.words)
        or _jaccard(ka.words, kb.words) >= 0.6
    )
    if similar and compatible and pages_close:
        return "likely", "Похожее название, те же авторы и число страниц"
    return None


def author_order(author: str) -> tuple[str, ...]:
    return tuple(_words(author))


@dataclass
class DuplicateGroupResult:
    books: list[Book]
    keep_id: int
    confidence: Confidence
    reasons: list[str] = field(default_factory=list)


def _keep_score(book: Book, readers: dict[int, int]) -> tuple:
    has_file = bool(book.pdf_storage_key or book.epub_storage_key)
    indexed = book.indexing_status == "succeeded"
    return (has_file, readers.get(book.id, 0), indexed, book.total_pages or 0, book.views or 0, -book.id)


async def readers_count(db: AsyncSession, book_ids: list[int]) -> dict[int, int]:
    if not book_ids:
        return {}
    rows = await db.execute(
        select(ReadingProgress.book_id, func.count())
        .where(ReadingProgress.book_id.in_(book_ids))
        .group_by(ReadingProgress.book_id)
    )
    return {book_id: count for book_id, count in rows.all()}


async def find_duplicate_groups(db: AsyncSession) -> list[DuplicateGroupResult]:
    books = (await db.scalars(select(Book).order_by(Book.id))).all()
    keys = {b.id: title_key(b.title) for b in books}

    # Сравниваем не все пары (их миллионы), а только книги с общим «якорем»:
    # файлом, первыми словами названия или заголовком без подзаголовка.
    buckets: dict[str, list[Book]] = {}
    for book in books:
        key = keys[book.id]
        anchors = set()
        if book.file_sha256:
            anchors.add("sha:" + book.file_sha256)
        if key.words:
            anchors.add("w:" + " ".join(key.words[:2]))
        if key.main:
            anchors.add("m:" + " ".join(key.main[:2]))
        for anchor in anchors:
            buckets.setdefault(anchor, []).append(book)

    parent = {b.id: b.id for b in books}

    def root(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    edges: dict[tuple[int, int], tuple[Confidence, str]] = {}
    for bucket in buckets.values():
        if len(bucket) < 2 or len(bucket) > 400:
            continue
        for i, a in enumerate(bucket):
            for b in bucket[i + 1:]:
                pair = (a.id, b.id) if a.id < b.id else (b.id, a.id)
                if pair in edges:
                    continue
                verdict = compare(a, b, keys[a.id], keys[b.id])
                if verdict:
                    edges[pair] = verdict
                    ra, rb = root(a.id), root(b.id)
                    if ra != rb:
                        parent[max(ra, rb)] = min(ra, rb)

    grouped: dict[int, list[Book]] = {}
    for book in books:
        grouped.setdefault(root(book.id), []).append(book)
    groups = [g for g in grouped.values() if len(g) > 1]
    readers = await readers_count(db, [b.id for g in groups for b in g])

    result = []
    for group in groups:
        ids = {b.id for b in group}
        group_edges = [v for (x, y), v in edges.items() if x in ids and y in ids]
        confidence: Confidence = "certain" if all(c == "certain" for c, _ in group_edges) else "likely"
        reasons = list(dict.fromkeys(reason for _, reason in group_edges))
        keep = max(group, key=lambda b: _keep_score(b, readers))
        result.append(DuplicateGroupResult(group, keep.id, confidence, reasons))
    result.sort(key=lambda g: (g.confidence != "certain", g.books[0].title.lower()))
    return result


@dataclass
class MergeStats:
    removed: list[int] = field(default_factory=list)
    moved_readers: int = 0
    storage_keys: list[str] = field(default_factory=list)


async def _move_unique(db: AsyncSession, model, keep_id: int, dup_id: int, newer_col) -> int:
    """Перенести записи (user_id, book_id) с копии на оригинал.

    Если у пользователя запись есть на обеих, оставляем более свежую.
    """
    moved = 0
    dup_rows = (await db.scalars(select(model).where(model.book_id == dup_id))).all()
    for row in dup_rows:
        existing = await db.scalar(
            select(model).where(model.book_id == keep_id, model.user_id == row.user_id)
        )
        if existing is not None:
            if (getattr(row, newer_col) or 0) > (getattr(existing, newer_col) or 0):
                await db.delete(existing)
                await db.flush()
            else:
                await db.delete(row)
                continue
        row.book_id = keep_id
        moved += 1
    await db.flush()
    return moved


async def merge_books(db: AsyncSession, keep: Book, duplicates: list[Book]) -> MergeStats:
    """Перенести всё пользовательское с копий на оригинал и удалить копии.

    Коммит и удаление файлов из хранилища — на вызывающем.
    """
    stats = MergeStats()
    for dup in duplicates:
        stats.moved_readers += await _move_unique(db, ReadingProgress, keep.id, dup.id, "last_read_at")
        await _move_unique(db, MyListEntry, keep.id, dup.id, "updated_at")
        await _move_unique(db, Review, keep.id, dup.id, "created_at")
        for model in (Annotation, BookComment, QuizAttempt, QuizSession):
            await db.execute(update(model).where(model.book_id == dup.id).values(book_id=keep.id))

        assigned = set(
            (await db.scalars(
                select(ReadingAssignment.department).where(ReadingAssignment.book_id == keep.id)
            )).all()
        )
        for assignment in (await db.scalars(
            select(ReadingAssignment).where(ReadingAssignment.book_id == dup.id)
        )).all():
            if assignment.department in assigned:
                await db.delete(assignment)
            else:
                assignment.book_id = keep.id
                assigned.add(assignment.department)

        in_collections = set(
            (await db.scalars(
                select(collection_books.c.collection_id).where(collection_books.c.book_id == keep.id)
            )).all()
        )
        dup_collections = (await db.scalars(
            select(collection_books.c.collection_id).where(collection_books.c.book_id == dup.id)
        )).all()
        await db.execute(delete(collection_books).where(collection_books.c.book_id == dup.id))
        for collection_id in dup_collections:
            if collection_id not in in_collections:
                await db.execute(collection_books.insert().values(collection_id=collection_id, book_id=keep.id))
                in_collections.add(collection_id)

        keep.views = (keep.views or 0) + (dup.views or 0)
        keep.downloads = (keep.downloads or 0) + (dup.downloads or 0)
        if not keep.required_for_department and dup.required_for_department:
            keep.required_for_department = dup.required_for_department

        keep_keys = {keep.pdf_storage_key, keep.epub_storage_key, keep.cover_storage_key}
        stats.storage_keys += [
            k for k in (dup.pdf_storage_key, dup.epub_storage_key, dup.cover_storage_key)
            if k and k not in keep_keys
        ]
        stats.removed.append(dup.id)
        await db.flush()
        await db.delete(dup)
    await db.flush()
    return stats
