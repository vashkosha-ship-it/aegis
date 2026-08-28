"""Замена индекса книги должна быть атомарной.

Раньше удаление старых страниц коммитилось отдельно, и каждая пачка новых —
тоже. Прерывание посередине (перезапуск воркера при деплое, обрыв соединения
с базой, нехватка памяти) оставляло книгу с частью страниц. Поиск при этом
формально работал, просто находил не всё — и отличить такую книгу от
нормально проиндексированной было нельзя.

Здесь проверяется, что при любом сбое книга остаётся в прежнем состоянии:
либо полностью новый индекс, либо полностью старый, но никогда не половина.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.book import Book
from app.models.book_page import BookPage
from app.services import search_index


@pytest_asyncio.fixture
async def read_session(engine):
    """Отдельная сессия для проверок после сбоя.

    Сессия, в которой произошла ошибка вставки, дальше используется только
    для отката. Читать из неё же — значит проверять заодно и её внутреннее
    состояние, а нас интересует состояние базы.
    """
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        yield session


async def _make_book(db, title: str = "Индексируемая") -> Book:
    book = Book(title=title, author="А", description="", total_pages=0)
    db.add(book)
    await db.commit()
    await db.refresh(book)
    return book


async def _seed_index(db, book_id: int, pages: list[str]) -> None:
    """Положить в индекс заранее известные страницы."""
    for page_no, text in enumerate(pages, start=1):
        db.add(BookPage(book_id=book_id, page=page_no, content=text))
    await db.commit()


async def _indexed(db, book_id: int) -> list[str]:
    rows = await db.scalars(
        select(BookPage.content)
        .where(BookPage.book_id == book_id)
        .order_by(BookPage.page)
    )
    return list(rows.all())


@pytest.fixture
def fake_extract(monkeypatch):
    """Подменить извлечение текста: тесты не про pypdf, а про транзакцию."""
    def apply(pages: list[str]):
        async def _fake(path: str) -> list[str]:
            return pages
        monkeypatch.setattr(search_index, "_extract_pages", _fake)
    return apply


# PostgreSQL не принимает NUL-байт в text-колонке и отклоняет вставку целиком.
# Это настоящий сбой базы посреди замены индекса — именно то, что нужно
# проверить. Подменять db.execute не годится: сессия остаётся в состоянии,
# которое SQLAlchemy не может корректно откатить, и падает уже сама проверка.
POISON = "текст с \x00 внутри"


class TestSuccessfulReplacement:
    async def test_replaces_old_index_entirely(self, db, fake_extract):
        book = await _make_book(db)
        await _seed_index(db, book.id, ["старая один", "старая два", "старая три"])

        fake_extract(["новая один", "новая два"])
        saved = await search_index.index_book_from_path(db, book.id, "/dev/null")

        assert saved == 2
        assert await _indexed(db, book.id) == ["новая один", "новая два"]

    async def test_updates_total_pages(self, db, fake_extract):
        book = await _make_book(db)
        fake_extract(["раз", "", "три", ""])

        await search_index.index_book_from_path(db, book.id, "/dev/null")

        await db.refresh(book)
        # total_pages — все страницы файла, включая пустые
        assert book.total_pages == 4

    async def test_blank_pages_are_not_stored(self, db, fake_extract):
        book = await _make_book(db)
        fake_extract(["текст", "   ", "", "ещё текст"])

        saved = await search_index.index_book_from_path(db, book.id, "/dev/null")

        assert saved == 2
        assert await _indexed(db, book.id) == ["текст", "ещё текст"]


class TestPartialFailureLeavesOldIndex:
    """Главное свойство: половины индекса не бывает.

    Идентификатор книги запоминается до вызова: rollback помечает все объекты
    сессии просроченными, и обращение к book.id после него полезет в базу
    синхронно, посреди асинхронного теста.
    """

    async def test_failure_during_insert_keeps_old_pages(self, db, read_session, fake_extract):
        book = await _make_book(db)
        book_id = book.id
        old = ["старая один", "старая два", "старая три"]
        await _seed_index(db, book_id, old)

        # Вторая страница уронит вставку — уже после того, как старые
        # страницы удалены в этой же транзакции.
        fake_extract(["новая один", POISON, "новая три"])

        with pytest.raises(Exception):  # noqa: B017 — важен факт отказа, не тип
            await search_index.index_book_from_path(db, book_id, "/dev/null")

        assert await _indexed(read_session, book_id) == old, (
            "старый индекс потерян, хотя новый не сохранился"
        )

    async def test_failure_on_last_page_keeps_old_pages(self, db, read_session, fake_extract):
        """Сбой в самом конце — тоже полный откат, а не «почти всё записалось»."""
        book = await _make_book(db)
        book_id = book.id
        old = ["было раз", "было два"]
        await _seed_index(db, book_id, old)

        fake_extract(["новая один", "новая два", POISON])

        with pytest.raises(Exception):  # noqa: B017
            await search_index.index_book_from_path(db, book_id, "/dev/null")

        assert await _indexed(read_session, book_id) == old

    async def test_multiple_batches_are_all_or_nothing(
        self, db, read_session, fake_extract, monkeypatch
    ):
        """С несколькими пачками поведение то же — транзакция общая.

        Первая пачка проходит целиком, вторая падает. Раньше это и означало
        «книга с половиной страниц»: первая пачка была отдельным коммитом.
        """
        monkeypatch.setattr(search_index, "PAGE_BATCH_SIZE", 2)

        book = await _make_book(db)
        book_id = book.id
        old = ["прежняя"]
        await _seed_index(db, book_id, old)

        fake_extract(["стр 1", "стр 2", "стр 3", POISON, "стр 5", "стр 6"])

        with pytest.raises(Exception):  # noqa: B017
            await search_index.index_book_from_path(db, book_id, "/dev/null")

        assert await _indexed(read_session, book_id) == old, (
            "сохранилась часть новых страниц"
        )

    async def test_total_pages_not_updated_on_failure(self, db, read_session, fake_extract):
        """Число страниц не должно уехать вперёд содержимого индекса."""
        book = await _make_book(db)
        book_id = book.id
        before = book.total_pages
        await _seed_index(db, book_id, ["одна страница"])

        fake_extract(["раз", "два", POISON, "четыре"])

        with pytest.raises(Exception):  # noqa: B017
            await search_index.index_book_from_path(db, book_id, "/dev/null")

        fresh = await read_session.get(Book, book_id)
        assert fresh.total_pages == before


class TestExtractionFailures:
    async def test_extraction_error_leaves_index_untouched(
        self, db, monkeypatch
    ):
        book = await _make_book(db)
        book_id = book.id
        old = ["старая один", "старая два"]
        await _seed_index(db, book_id, old)

        async def _boom(path: str):
            raise search_index.ExtractionTimeout("слишком долго")

        monkeypatch.setattr(search_index, "_extract_pages", _boom)

        with pytest.raises(search_index.ExtractionTimeout):
            await search_index.index_book_from_path(db, book_id, "/dev/null")

        assert await _indexed(db, book_id) == old

    async def test_empty_extraction_refused(self, db, fake_extract):
        """Ни одной страницы — файл не прочитан, а не «книга пустая»."""
        book = await _make_book(db)
        fake_extract([])

        with pytest.raises(search_index.IndexingError):
            await search_index.index_book_from_path(db, book.id, "/dev/null")


class TestRegressionGuard:
    async def test_refuses_to_replace_text_with_nothing(self, db, fake_extract):
        """Был текст, стало пусто — скорее поломка, чем намерение."""
        book = await _make_book(db)
        book_id = book.id
        await _seed_index(db, book_id, ["содержательная страница"])

        fake_extract(["", "   ", ""])

        with pytest.raises(search_index.IndexWouldRegress):
            await search_index.index_book_from_path(db, book_id, "/dev/null")

        assert await _indexed(db, book_id) == ["содержательная страница"]

    async def test_force_allows_emptying(self, db, fake_extract):
        book = await _make_book(db)
        await _seed_index(db, book.id, ["содержательная страница"])

        fake_extract(["", ""])
        saved = await search_index.index_book_from_path(
            db, book.id, "/dev/null", force=True
        )

        assert saved == 0
        assert await _indexed(db, book.id) == []

    async def test_scan_without_previous_index_is_allowed(self, db, fake_extract):
        """Скан без текстового слоя индексируется как пустой — это нормально."""
        book = await _make_book(db)
        fake_extract(["", "", ""])

        saved = await search_index.index_book_from_path(db, book.id, "/dev/null")

        assert saved == 0
        await db.refresh(book)
        assert book.total_pages == 3


class TestHelpers:
    async def test_count_indexed_pages(self, db):
        book = await _make_book(db)
        assert await search_index.count_indexed_pages(db, book.id) == 0

        await _seed_index(db, book.id, ["раз", "два"])
        assert await search_index.count_indexed_pages(db, book.id) == 2

    async def test_is_book_indexed(self, db):
        book = await _make_book(db)
        assert await search_index.is_book_indexed(db, book.id) is False

        await _seed_index(db, book.id, ["раз"])
        assert await search_index.is_book_indexed(db, book.id) is True

    async def test_pages_of_other_books_untouched(self, db, fake_extract):
        first = await _make_book(db, "Первая")
        second = await _make_book(db, "Вторая")
        await _seed_index(db, first.id, ["первая страница"])
        await _seed_index(db, second.id, ["вторая страница"])

        fake_extract(["новое содержимое"])
        await search_index.index_book_from_path(db, first.id, "/dev/null")

        assert await _indexed(db, second.id) == ["вторая страница"]
        remaining = await db.scalar(select(func.count(BookPage.id)))
        assert remaining == 2
