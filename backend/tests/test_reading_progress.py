"""Тесты прогресса чтения и завершения книги.

Покрывают правила, которые иначе легко потерять при рефакторинге:
серверный total_pages, запрет мгновенного «дочитывания» и начисление XP.
"""
from __future__ import annotations

from sqlalchemy import select

from app.models.book import Book
from app.models.library import MyListEntry, MyListStatus, ReadingProgress
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

        await _put_progress(client, approved_user, book.id, 50)
        await _put_progress(client, approved_user, book.id, 150)
        r = await _put_progress(client, approved_user, book.id, 200)
        assert r.status_code == 200

        progress = await db.scalar(
            select(ReadingProgress).where(ReadingProgress.book_id == book.id)
        )
        await db.refresh(progress)
        assert progress.finished_at is not None

    async def test_completion_marks_mylist(self, client, db, approved_user):
        """Дочитанная книга должна попасть в «Прочитано», иначе счётчики разойдутся."""
        book = await _make_book(db, total_pages=100)

        await _put_progress(client, approved_user, book.id, 60)
        await _put_progress(client, approved_user, book.id, 100)

        entry = await db.scalar(
            select(MyListEntry).where(
                MyListEntry.user_id == approved_user.id,
                MyListEntry.book_id == book.id,
            )
        )
        assert entry is not None
        assert entry.status == MyListStatus.COMPLETED

    async def test_completion_awards_xp_once(self, client, db, approved_user):
        """Повторный выход на последнюю страницу не должен доначислять XP."""
        book = await _make_book(db, total_pages=100)

        await _put_progress(client, approved_user, book.id, 60)
        await _put_progress(client, approved_user, book.id, 100)
        await db.refresh(approved_user)
        xp_after_finish = approved_user.xp

        await _put_progress(client, approved_user, book.id, 99)
        await _put_progress(client, approved_user, book.id, 100)
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
        офлайн-чтения приходит только последняя страница — сервер видит прыжок
        и завершение не засчитывает. Мы сознательно предпочли это возможности
        накрутки: подменить прогресс проще, чем дочитать книгу без сети.
        """
        book = await _make_book(db, total_pages=300)

        r = await _put_progress(client, approved_user, book.id, 300)
        assert r.status_code == 200

        progress = await db.scalar(
            select(ReadingProgress).where(ReadingProgress.book_id == book.id)
        )
        await db.refresh(progress)
        assert progress.finished_at is None
