"""Тесты прогресса чтения и завершения книги.

Покрывают правила, которые иначе легко потерять при рефакторинге:
серверный total_pages, запрет мгновенного «дочитывания» и начисление XP.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.models.book import Book
from app.models.library import MyListEntry, MyListStatus, ReadingProgress
from app.services import reading_progress as rp
from tests.conftest import auth_headers


async def _make_book(db, total_pages: int | None = 300) -> Book:
    book = Book(title="Книга", author="Автор", description="", total_pages=total_pages)
    db.add(book)
    await db.commit()
    await db.refresh(book)
    return book


async def _put_progress(client, user, book_id, page, total=None):
    body = {"current_page": page}
    if total is not None:
        body["total_pages"] = total
    return await client.put(
        f"/books/{book_id}/progress", headers=auth_headers(user), json=body
    )


async def _backdate(db, user_id: int, book_id: int, seconds: int) -> None:
    """Сдвинуть last_read_at назад, имитируя паузу между обновлениями.

    Пишем через Core: у колонки onupdate=func.now(), и присвоение через ORM
    затёрлось бы текущим временем при коммите. Сбрасываем только эту строку —
    expire_all пометил бы просроченными и книгу с пользователем.
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
    progress = await db.scalar(
        select(ReadingProgress).where(
            ReadingProgress.user_id == user_id,
            ReadingProgress.book_id == book_id,
        )
    )
    if progress is not None:
        db.expire(progress)


async def _read_book(client, db, user, book_id: int, total: int) -> None:
    """Прочитать книгу так, как это делает живой читатель.

    Раньше для завершения хватало двух обновлений — на середину и на конец.
    Теперь сервер копит продвижение по частям и считает время, поэтому нужен
    настоящий проход: шагами не больше потолка и с паузами между запросами.
    """
    user_id = user.id
    step = rp.MAX_PAGES_CREDITED_PER_UPDATE
    page = 1
    while page < total:
        page = min(page + step, total)
        await _put_progress(client, user, book_id, page)
        await _backdate(db, user_id, book_id, 30)

    # Читатель задержался на последней странице — так накапливается время
    # на коротких книгах, где переходов слишком мало.
    await _put_progress(client, user, book_id, total)


class TestPageValidation:
    async def test_page_beyond_book_rejected(self, client, db, approved_user):
        """Раньше можно было прислать 999999 и накрутить дневную статистику."""
        book = await _make_book(db, total_pages=100)

        r = await _put_progress(client, approved_user, book.id, 999999)
        assert r.status_code == 400

    async def test_zero_page_rejected(self, client, db, approved_user):
        book = await _make_book(db, total_pages=100)

        r = await _put_progress(client, approved_user, book.id, 0)
        assert r.status_code == 422  # схема требует ge=1

    async def test_client_total_pages_ignored_when_server_knows(
        self, client, db, approved_user
    ):
        """Ключевая защита: подменив total_pages=2, книгу нельзя «дочитать»."""
        book = await _make_book(db, total_pages=300)

        r = await _put_progress(client, approved_user, book.id, 2, total=2)
        assert r.status_code == 200
        assert r.json()["total_pages"] == 300, "сервер должен верить своему значению"

    async def test_client_total_used_when_server_unknown(
        self, client, db, approved_user
    ):
        """Пока книга не проиндексирована, число страниц берём у клиента."""
        book = await _make_book(db, total_pages=None)

        r = await _put_progress(client, approved_user, book.id, 5, total=120)
        assert r.status_code == 200
        assert r.json()["total_pages"] == 120


class TestBookCompletion:
    async def test_jump_to_last_page_does_not_complete(
        self, client, db, approved_user
    ):
        """Открыть книгу и сразу перемотать в конец — не чтение."""
        book = await _make_book(db, total_pages=200)

        r = await _put_progress(client, approved_user, book.id, 200)
        assert r.status_code == 200

        progress = await db.scalar(
            select(ReadingProgress).where(ReadingProgress.book_id == book.id)
        )
        await db.refresh(progress)
        assert progress.finished_at is None, "завершение не должно засчитаться"

    async def test_gradual_reading_completes(self, client, db, approved_user):
        """Нормальный сценарий: читал постепенно и дошёл до конца."""
        book = await _make_book(db, total_pages=200)
        book_id = book.id

        await _read_book(client, db, approved_user, book_id, 200)

        progress = await db.scalar(
            select(ReadingProgress).where(ReadingProgress.book_id == book_id)
        )
        await db.refresh(progress)
        assert progress.finished_at is not None, (
            f"честное чтение не засчиталось: продвижение "
            f"{progress.pages_advanced}, время {progress.reading_seconds} с"
        )

    async def test_completion_marks_mylist(self, client, db, approved_user):
        """Дочитанная книга должна попасть в «Прочитано», иначе счётчики разойдутся."""
        book = await _make_book(db, total_pages=100)
        book_id = book.id
        user_id = approved_user.id

        await _read_book(client, db, approved_user, book_id, 100)

        entry = await db.scalar(
            select(MyListEntry).where(
                MyListEntry.user_id == user_id,
                MyListEntry.book_id == book_id,
            )
        )
        assert entry is not None
        assert entry.status == MyListStatus.COMPLETED

    async def test_completion_awards_xp_once(self, client, db, approved_user):
        """Повторный выход на последнюю страницу не должен доначислять XP."""
        book = await _make_book(db, total_pages=100)
        book_id = book.id

        await _read_book(client, db, approved_user, book_id, 100)
        await db.refresh(approved_user)
        xp_after_finish = approved_user.xp

        progress = await db.scalar(
            select(ReadingProgress).where(ReadingProgress.book_id == book_id)
        )
        await db.refresh(progress)
        assert progress.finished_at is not None, "книга должна быть дочитана"

        await _put_progress(client, approved_user, book_id, 99)
        await _put_progress(client, approved_user, book_id, 100)
        await db.refresh(approved_user)

        assert approved_user.xp == xp_after_finish


class TestXpAndStreak:
    async def test_first_open_awards_xp(self, client, db, approved_user):
        book = await _make_book(db, total_pages=100)
        xp_before = approved_user.xp

        await _put_progress(client, approved_user, book.id, 1)
        await db.refresh(approved_user)

        assert approved_user.xp > xp_before

    async def test_second_open_does_not_award_again(self, client, db, approved_user):
        book = await _make_book(db, total_pages=100)

        await _put_progress(client, approved_user, book.id, 1)
        await db.refresh(approved_user)
        xp_after_first = approved_user.xp

        await _put_progress(client, approved_user, book.id, 2)
        await db.refresh(approved_user)

        assert approved_user.xp == xp_after_first


class TestOfflineLimitation:
    async def test_offline_bulk_sync_does_not_complete(
        self, client, db, approved_user
    ):
        """Известное ограничение, зафиксированное намеренно.

        Очередь синхронизации хранит одну запись на книгу, поэтому после
        офлайн-чтения приходит только последняя страница. Сервер засчитывает
        за одно обновление не больше нескольких страниц продвижения, так что
        завершение не наступает.

        Это осознанный размен: отличить «читал без сети» от «подставил номер
        страницы» по одному запросу невозможно, а подставить номер несравнимо
        проще, чем дочитать книгу. Цена — офлайн-читателю придётся пройти
        последние страницы онлайн.
        """
        book = await _make_book(db, total_pages=300)

        r = await _put_progress(client, approved_user, book.id, 300)
        assert r.status_code == 200

        progress = await db.scalar(
            select(ReadingProgress).where(ReadingProgress.book_id == book.id)
        )
        await db.refresh(progress)
        assert progress.finished_at is None
