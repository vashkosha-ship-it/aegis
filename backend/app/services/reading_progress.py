"""Логика прогресса чтения.

Вынесено из роутера: здесь проверка присланных страниц, учёт дневной
статистики, начисление XP и фиксация дочитывания. Логика не зависит от HTTP,
поэтому вместо HTTPException бросает свои исключения.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.models.library import (
    DailyPagesRead,
    MyListEntry,
    MyListStatus,
    ReadingProgress,
)
from app.models.user import User
from app.services.gamification import (
    add_xp,
    check_and_award_achievements,
    update_streak,
)

logger = logging.getLogger(__name__)

# Защита от мусорных значений: книг с таким числом страниц не бывает,
# а без верхней границы клиент мог накрутить статистику.
MAX_PAGES = 20000

XP_FOR_STARTING_BOOK = 10
XP_FOR_FINISHING_BOOK = 25


class ProgressError(Exception):
    """Базовая ошибка обновления прогресса."""


class BookNotFound(ProgressError):
    pass


class InvalidPageNumber(ProgressError):
    """Присланная страница вне диапазона книги."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def resolve_total_pages(book: Book, claimed_total: int | None) -> int:
    """Определить, сколько страниц в книге на самом деле.

    Приоритет у значения из БД (его проставляет индексация PDF). Если сервер
    ещё не знает — доверяем клиенту, но в разумных пределах.
    """
    known_total = book.total_pages or 0
    claimed = claimed_total or known_total or 1

    if claimed < 1 or claimed > MAX_PAGES:
        raise InvalidPageNumber("Некорректное число страниц")

    return known_total if known_total > 0 else claimed


async def _bump_daily_pages(db: AsyncSession, user: User, delta: int) -> None:
    """Прибавить прочитанные страницы к сегодняшнему счётчику."""
    if delta <= 0:
        return

    today = datetime.now(UTC).date()
    daily = await db.scalar(
        select(DailyPagesRead).where(
            DailyPagesRead.user_id == user.id,
            DailyPagesRead.date == today,
        )
    )
    if not daily:
        db.add(DailyPagesRead(user_id=user.id, date=today, pages=delta))
    else:
        daily.pages += delta


async def _mark_completed_in_list(db: AsyncSession, user: User, book_id: int) -> None:
    """Проставить статус «Прочитано» в списке пользователя.

    Нужно, чтобы счётчики достижений и карточка книги не расходились с
    реальным прогрессом по страницам.
    """
    entry = await db.scalar(
        select(MyListEntry).where(
            MyListEntry.user_id == user.id,
            MyListEntry.book_id == book_id,
        )
    )
    if entry:
        entry.status = MyListStatus.COMPLETED
    else:
        db.add(
            MyListEntry(user_id=user.id, book_id=book_id, status=MyListStatus.COMPLETED)
        )


async def update_reading_progress(
    db: AsyncSession,
    user: User,
    book_id: int,
    current_page: int,
    claimed_total_pages: int | None,
) -> ReadingProgress:
    """Обновить прогресс чтения книги.

    Начисляет XP за первое открытие и за дочитывание, ведёт дневную
    статистику и стрик. Значения страниц проверяются: без этого клиент мог
    прислать current_page=999999 и накрутить всё сразу.
    """
    book = await db.get(Book, book_id)
    if not book:
        raise BookNotFound(book_id)

    total_pages = resolve_total_pages(book, claimed_total_pages)
    if current_page < 1 or current_page > total_pages:
        raise InvalidPageNumber(f"Страница вне диапазона книги (1–{total_pages})")

    progress = await db.scalar(
        select(ReadingProgress).where(
            ReadingProgress.user_id == user.id,
            ReadingProgress.book_id == book_id,
        )
    )

    is_first_start = False
    if not progress:
        progress = ReadingProgress(
            user_id=user.id,
            book_id=book_id,
            current_page=current_page,
            total_pages=total_pages,
            started=True,
        )
        db.add(progress)
        is_first_start = True
    else:
        previous_page = progress.current_page
        progress.current_page = current_page
        progress.total_pages = total_pages
        if not progress.started:
            progress.started = True
            is_first_start = True
        await _bump_daily_pages(db, user, current_page - previous_page)

    if is_first_start:
        await add_xp(db, user, XP_FOR_STARTING_BOOK)
        await update_streak(db, user)
        await check_and_award_achievements(db, user, trigger="reading_started")

    # Книга считается дочитанной по факту дохода до последней страницы, а не
    # по отметке в списке — её можно поставить не открывая книгу.
    just_finished = (
        total_pages > 1 and current_page >= total_pages and not progress.finished_at
    )
    if just_finished:
        progress.finished_at = datetime.now(UTC)
        await _mark_completed_in_list(db, user, book_id)
        await add_xp(db, user, XP_FOR_FINISHING_BOOK)
        await check_and_award_achievements(db, user, trigger="book_completed")

    await db.commit()
    await db.refresh(progress)
    return progress
