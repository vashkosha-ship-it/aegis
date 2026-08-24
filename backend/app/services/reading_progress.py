"""Логика прогресса чтения.

Вынесено из роутера: здесь проверка присланных страниц, учёт дневной
статистики, начисление XP и фиксация дочитывания. Логика не зависит от HTTP,
поэтому вместо HTTPException бросает свои исключения.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
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

# Какую долю книги нужно пройти, чтобы завершение засчиталось. Порог мягкий:
# цель — отсечь перемотку в конец сразу после открытия, а не измерять
# вовлечённость.
MIN_PROGRESS_RATIO = 0.5


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
    """Определить, сколько страниц в книге.

    Источник истины — значение из БД: его проставляет индексация PDF, то есть
    оно получено из самого файла. Клиентскому числу верим только пока сервер
    своего не знает, иначе достаточно прислать total_pages=1 и книга сразу
    «дочитана».
    """
    known_total = book.total_pages or 0
    if known_total > 0:
        return known_total

    claimed = claimed_total or 1
    if claimed < 1 or claimed > MAX_PAGES:
        raise InvalidPageNumber("Некорректное число страниц")
    return claimed


def _looks_like_real_reading(
    progress: ReadingProgress, previous_page: int, total_pages: int
) -> bool:
    """Похоже ли это на настоящее чтение, а не на перемотку в конец.

    Отдельного поля «когда начал» в модели нет, поэтому опираемся на то, что
    известно: сколько страниц пользователь прошёл до этого обновления.
    Требуем, чтобы он уже был хотя бы на половине книги. Это отсекает
    «открыл и сразу пролистал в конец», но не мешает тем, кто дочитывает
    начатое.
    """
    if previous_page <= 1:
        # Первое же обновление ставит последнюю страницу — чтения не было
        return False
    return previous_page >= total_pages * MIN_PROGRESS_RATIO


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
    if daily:
        daily.pages += delta
        return

    db.add(DailyPagesRead(user_id=user.id, date=today, pages=delta))
    try:
        await db.flush()
    except IntegrityError:
        # Запись за сегодня создал параллельный запрос — прибавляем к ней.
        await db.rollback()
        daily = await db.scalar(
            select(DailyPagesRead)
            .where(
                DailyPagesRead.user_id == user.id,
                DailyPagesRead.date == today,
            )
            .with_for_update()
        )
        if daily is None:
            raise
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

    # FOR UPDATE: параллельные обновления (две вкладки, синхронизация офлайна)
    # иначе оба прочитают старую страницу, оба посчитают дельту от неё — и
    # дневная статистика вырастет вдвое. Второй запрос теперь ждёт первый.
    progress = await db.scalar(
        select(ReadingProgress)
        .where(
            ReadingProgress.user_id == user.id,
            ReadingProgress.book_id == book_id,
        )
        .with_for_update()
    )

    is_first_start = False
    previous_page = 0
    if not progress:
        progress = ReadingProgress(
            user_id=user.id,
            book_id=book_id,
            current_page=current_page,
            total_pages=total_pages,
            started=True,
        )
        db.add(progress)
        try:
            # flush, а не commit: нужно поймать конфликт уникальности здесь,
            # пока транзакцию ещё можно откатить и перечитать чужую запись.
            await db.flush()
        except IntegrityError:
            # Параллельный запрос успел создать запись раньше — берём её.
            await db.rollback()
            progress = await db.scalar(
                select(ReadingProgress)
                .where(
                    ReadingProgress.user_id == user.id,
                    ReadingProgress.book_id == book_id,
                )
                .with_for_update()
            )
            if progress is None:
                raise
            previous_page = progress.current_page
            progress.current_page = current_page
            progress.total_pages = total_pages
            await _bump_daily_pages(db, user, current_page - previous_page)
        else:
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
    #
    # Но одного лишь попадания на последнюю страницу мало: открыть книгу и сразу
    # перемотать в конец — не чтение. Требуем, чтобы между первым открытием и
    # завершением прошло разумное время и чтобы прогресс шёл постепенно.
    reached_end = total_pages > 1 and current_page >= total_pages
    just_finished = reached_end and not progress.finished_at

    if just_finished and not _looks_like_real_reading(
        progress, previous_page, total_pages
    ):
        logger.info(
            "Пользователь %s долистал книгу %s до конца слишком быстро — "
            "не засчитываем завершение",
            user.id, book_id,
        )
        just_finished = False
    if just_finished:
        progress.finished_at = datetime.now(UTC)
        await _mark_completed_in_list(db, user, book_id)
        await add_xp(db, user, XP_FOR_FINISHING_BOOK)
        await check_and_award_achievements(db, user, trigger="book_completed")

    await db.commit()
    await db.refresh(progress)
    return progress
