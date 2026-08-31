"""Прогресс чтения не должен накручиваться клиентом.

Раньше «дочитал» определялось по позиции: требовалось, чтобы перед финальным
обновлением пользователь был хотя бы на середине книги. Позицию присылает
клиент, поэтому хватало двух запросов — сначала на середину, потом на конец.

Теперь сервер считает сам: продвижение накапливается по частям (не больше
нескольких страниц за обновление) и отдельно копится время чтения. Плюс
завершение засчитывается только для книг, число страниц которых сервер узнал
из самого файла при индексации, а не со слов клиента.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, update

from app.models.book import Book
from app.models.library import DailyPagesRead, ReadingProgress
from app.services import reading_progress as rp


async def _make_book(db, total_pages: int, title: str = "Книга") -> Book:
    """Книга с известным сервером числом страниц (как после индексации)."""
    book = Book(title=title, author="А", description="", total_pages=total_pages)
    db.add(book)
    await db.commit()
    await db.refresh(book)
    return book


async def _get_progress(db, user_id: int, book_id: int) -> ReadingProgress:
    return await db.scalar(
        select(ReadingProgress).where(
            ReadingProgress.user_id == user_id,
            ReadingProgress.book_id == book_id,
        )
    )


async def _backdate(db, user_id: int, book_id: int, seconds: int) -> None:
    """Сдвинуть last_read_at назад, имитируя паузу между обновлениями.

    Через ORM это не работает: у колонки onupdate=func.now(), и при коммите
    значение затирается текущим временем. Явное значение в Core-update
    приоритетнее onupdate, поэтому пишем напрямую.

    Сбрасываем только строку прогресса, а не всю сессию: expire_all пометил бы
    просроченными и книгу, и пользователя, после чего обращение к user.id уже
    внутри сервиса полезло бы в базу синхронно.
    """
    await db.execute(
        update(ReadingProgress)
        .where(
            ReadingProgress.user_id == user_id,
            ReadingProgress.book_id == book_id,
        )
        .values(last_read_at=datetime.now(UTC) - timedelta(seconds=seconds))
    )
    await db.commit()

    progress = await _get_progress(db, user_id, book_id)
    if progress is not None:
        db.expire(progress)


async def _read_through(
    db, user, book_id: int, total: int, *, step: int = 5, seconds_per_step: int = 30
):
    """Пройти книгу так, как это делает живой читатель."""
    user_id = user.id
    page = 1
    while page < total:
        page = min(page + step, total)
        if await _get_progress(db, user_id, book_id) is not None:
            await _backdate(db, user_id, book_id, seconds_per_step)
        await rp.update_reading_progress(db, user, book_id, page, None)

    # Последнее обновление на той же странице: читатель дочитал и задержался
    # на ней. Для коротких книг это единственный способ накопить время —
    # переходов между страницами там слишком мало.
    await _backdate(db, user_id, book_id, seconds_per_step)
    await rp.update_reading_progress(db, user, book_id, total, None)


class TestTwoRequestBypass:
    """Обход, ради которого всё это и переписывалось."""

    async def test_half_then_end_does_not_finish(self, db, approved_user):
        book = await _make_book(db, total_pages=300)
        book_id = book.id

        await rp.update_reading_progress(db, approved_user, book_id, 150, None)
        await rp.update_reading_progress(db, approved_user, book_id, 300, None)

        progress = await _get_progress(db, approved_user.id, book_id)
        assert progress.finished_at is None, (
            "книга засчитана дочитанной за два запроса"
        )

    async def test_single_jump_to_end_does_not_finish(self, db, approved_user):
        book = await _make_book(db, total_pages=300)
        book_id = book.id

        await rp.update_reading_progress(db, approved_user, book_id, 300, None)

        progress = await _get_progress(db, approved_user.id, book_id)
        assert progress.finished_at is None

    async def test_many_jumps_still_limited_by_time(self, db, approved_user):
        """Сотня запросов подряд не заменяет время: паузы между ними нулевые."""
        book = await _make_book(db, total_pages=100)
        book_id = book.id

        for page in range(2, 101):
            await rp.update_reading_progress(db, approved_user, book_id, page, None)

        progress = await _get_progress(db, approved_user.id, book_id)
        assert progress.pages_advanced >= 50, "продвижение должно набраться"
        assert progress.reading_seconds < 10, "время не должно взяться из воздуха"
        assert progress.finished_at is None


class TestHonestReadingStillWorks:
    async def test_normal_reading_finishes_the_book(self, db, approved_user):
        book = await _make_book(db, total_pages=60)
        book_id = book.id

        await _read_through(db, approved_user, book_id, 60, step=5, seconds_per_step=30)

        progress = await _get_progress(db, approved_user.id, book_id)
        assert progress.finished_at is not None, (
            f"честное чтение не засчиталось: продвижение "
            f"{progress.pages_advanced}, время {progress.reading_seconds} с"
        )

    async def test_reading_seconds_accumulate(self, db, approved_user):
        book = await _make_book(db, total_pages=50)
        book_id = book.id

        await rp.update_reading_progress(db, approved_user, book_id, 2, None)
        await _backdate(db, approved_user.id, book_id, 45)

        await rp.update_reading_progress(db, approved_user, book_id, 4, None)
        progress = await _get_progress(db, approved_user.id, book_id)
        assert 40 <= progress.reading_seconds <= 50


class TestCreditedAdvance:
    def test_forward_movement_is_capped(self):
        assert rp._credited_advance(1, 500) == rp.MAX_PAGES_CREDITED_PER_UPDATE

    def test_small_step_counted_fully(self):
        assert rp._credited_advance(10, 13) == 3

    def test_going_back_gives_nothing(self):
        assert rp._credited_advance(100, 20) == 0

    def test_same_page_gives_nothing(self):
        assert rp._credited_advance(42, 42) == 0


class TestCreditedSeconds:
    def test_long_pause_not_counted(self):
        now = datetime.now(UTC)
        long_ago = now - timedelta(seconds=rp.MAX_GAP_SECONDS + 60)
        assert rp._credited_seconds(long_ago, now) == 0

    def test_reasonable_gap_counted(self):
        now = datetime.now(UTC)
        assert rp._credited_seconds(now - timedelta(seconds=60), now) == 60

    def test_no_previous_reading_gives_nothing(self):
        assert rp._credited_seconds(None, datetime.now(UTC)) == 0

    def test_naive_datetime_handled(self):
        """last_read_at из БД может прийти без часового пояса."""
        now = datetime.now(UTC)
        naive = (now - timedelta(seconds=30)).replace(tzinfo=None)
        assert rp._credited_seconds(naive, now) == 30


class TestUnverifiedTotalPages:
    """Число страниц со слов клиента не даёт засчитать завершение."""

    async def test_client_total_does_not_finish_book(self, db, approved_user):
        # total_pages=0 — книга не проиндексирована, сервер числа не знает
        book = Book(title="Без индекса", author="А", description="", total_pages=0)
        db.add(book)
        await db.commit()
        await db.refresh(book)
        book_id = book.id

        # Классическая накрутка: «в книге одна страница, я на ней»
        await rp.update_reading_progress(db, approved_user, book_id, 1, 1)

        progress = await _get_progress(db, approved_user.id, book_id)
        assert progress.finished_at is None

    async def test_verified_flag_follows_indexing(self, db):
        indexed = Book(title="С индексом", author="А", description="", total_pages=120)
        raw = Book(title="Без индекса", author="А", description="", total_pages=0)
        assert rp.is_total_verified(indexed) is True
        assert rp.is_total_verified(raw) is False


class TestDailyStatsUseCreditedPages:
    """Дневная статистика тоже не должна расти от прыжков."""

    async def test_jump_does_not_inflate_heatmap(self, db, approved_user):
        book = await _make_book(db, total_pages=500)
        book_id = book.id

        await rp.update_reading_progress(db, approved_user, book_id, 500, None)

        pages = await db.scalar(
            select(DailyPagesRead.pages).where(
                DailyPagesRead.user_id == approved_user.id
            )
        )
        assert pages is not None
        assert pages <= rp.MAX_PAGES_CREDITED_PER_UPDATE, (
            f"в дневную статистику попало {pages} страниц за один запрос"
        )


class TestFinishGuardReasons:
    """Отказ должен объясняться — иначе разбираться в логах невозможно."""

    def test_unverified_total(self):
        progress = ReadingProgress(pages_advanced=1000, reading_seconds=100000)
        allowed, reason = rp._may_count_as_finished(progress, 100, False)
        assert allowed is False
        assert "не подтверждено" in reason

    def test_not_enough_advance(self):
        progress = ReadingProgress(pages_advanced=5, reading_seconds=100000)
        allowed, reason = rp._may_count_as_finished(progress, 100, True)
        assert allowed is False
        assert "страниц" in reason

    def test_not_enough_time(self):
        progress = ReadingProgress(pages_advanced=100, reading_seconds=1)
        allowed, reason = rp._may_count_as_finished(progress, 100, True)
        assert allowed is False
        assert "чтения" in reason

    def test_all_conditions_met(self):
        progress = ReadingProgress(pages_advanced=100, reading_seconds=100000)
        allowed, reason = rp._may_count_as_finished(progress, 100, True)
        assert allowed is True
        assert reason == ""


@pytest.mark.parametrize("total_pages", [2, 10, 100])
class TestShortBooks:
    """На коротких книгах требования не должны становиться невыполнимыми."""

    async def test_can_finish_short_book(self, db, approved_user, total_pages):
        book = await _make_book(db, total_pages=total_pages, title=f"Кн{total_pages}")
        book_id = book.id

        await _read_through(
            db, approved_user, book_id, total_pages, step=1, seconds_per_step=20
        )

        progress = await _get_progress(db, approved_user.id, book_id)
        assert progress.finished_at is not None, (
            f"книга на {total_pages} страниц не засчитана: продвижение "
            f"{progress.pages_advanced}, время {progress.reading_seconds} с"
        )
