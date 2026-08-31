"""Логика прогресса чтения.

Вынесено из роутера: здесь проверка присланных страниц, учёт дневной
статистики, начисление XP и фиксация дочитывания. Логика не зависит от HTTP,
поэтому вместо HTTPException бросает свои исключения.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
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

# Какую долю книги нужно пройти, чтобы завершение засчиталось.
MIN_PROGRESS_RATIO = 0.5

# Сколько страниц продвижения засчитывается за одно обновление. Это ключевое
# ограничение: раньше «дочитал» определялось по позиции, а позицию присылает
# клиент — хватало двух запросов, на середину и на конец. Теперь скачок с 1-й
# страницы на 500-ю добавляет к счётчику продвижения не 499, а 10, поэтому
# книгу нельзя «пролистать» меньше чем за десятки обращений.
#
# Для честного читателя ограничение незаметно: за один переход страница
# меняется на единицу.
MAX_PAGES_CREDITED_PER_UPDATE = 10

# Промежуток между обновлениями, который засчитывается как время чтения.
# Больше — считаем, что вкладка просто осталась открытой.
MAX_GAP_SECONDS = 300

# Сколько секунд на страницу требуется как минимум. Не измерение скорости
# чтения, а нижняя граница правдоподобия: 300-страничную книгу нельзя
# дочитать за минуту.
MIN_SECONDS_PER_PAGE = 2.0


class ProgressError(Exception):
    """Базовая ошибка обновления прогресса."""


class BookNotFound(ProgressError):
    pass


class InvalidPageNumber(ProgressError):
    """Присланная страница вне диапазона книги."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def is_total_verified(book: Book) -> bool:
    """Знает ли сервер число страниц из самого файла.

    total_pages проставляет индексация PDF. Если её не было, число приходит от
    клиента — и доверять ему в вопросах начисления нельзя.
    """
    return (book.total_pages or 0) > 0


def resolve_total_pages(book: Book, claimed_total: int | None) -> int:
    """Определить, сколько страниц в книге.

    Источник истины — значение из БД: его проставляет индексация PDF, то есть
    оно получено из самого файла. Клиентскому числу верим только пока сервер
    своего не знает, и только для показа прогресса: завершение по такому числу
    не засчитывается (см. is_total_verified).
    """
    known_total = book.total_pages or 0
    if known_total > 0:
        return known_total

    claimed = claimed_total or 1
    if claimed < 1 or claimed > MAX_PAGES:
        raise InvalidPageNumber("Некорректное число страниц")
    return claimed


def _credited_advance(previous_page: int, current_page: int) -> int:
    """Сколько страниц продвижения засчитать за это обновление.

    Считаем только движение вперёд и не больше потолка за раз. Возврат назад
    (перечитывание) даёт ноль, а не отрицательное число: иначе счётчик можно
    было бы обнулить и накрутить заново.
    """
    delta = current_page - previous_page
    if delta <= 0:
        return 0
    return min(delta, MAX_PAGES_CREDITED_PER_UPDATE)


def _credited_seconds(last_read_at: datetime | None, now: datetime) -> int:
    """Сколько секунд чтения засчитать за промежуток до этого обновления.

    Длинные паузы отбрасываем целиком: открытая на ночь вкладка не должна
    превращаться в восемь часов чтения. Это и есть серверный учёт времени —
    клиент о нём не знает и подделать его отдельным полем не может.
    """
    if last_read_at is None:
        return 0
    if last_read_at.tzinfo is None:
        last_read_at = last_read_at.replace(tzinfo=UTC)
    gap = (now - last_read_at).total_seconds()
    if gap <= 0 or gap > MAX_GAP_SECONDS:
        return 0
    return int(gap)


def _may_count_as_finished(
    progress: ReadingProgress, total_pages: int, total_verified: bool
) -> tuple[bool, str]:
    """Можно ли засчитать дочитывание. Вторым значением — причина отказа.

    Три условия, и каждое закрывает свой способ обойти проверку.

    Число страниц должно быть известно серверу из файла. Иначе достаточно
    прислать total_pages=1 и оказаться на последней странице.

    Продвижение должно набраться по частям. Прежняя проверка смотрела, где
    пользователь находился до финального обновления, — и обходилась двумя
    запросами: сначала на середину, потом на конец. Счётчик продвижения так не
    обмануть: он растёт не больше чем на MAX_PAGES_CREDITED_PER_UPDATE за раз.

    Времени должно пройти правдоподобно много. Даже если слать сотню запросов
    подряд, книга не дочитывается за секунды.
    """
    if not total_verified:
        return False, "число страниц не подтверждено сервером"

    required_pages = total_pages * MIN_PROGRESS_RATIO
    if progress.pages_advanced < required_pages:
        return False, (
            f"пройдено {progress.pages_advanced} страниц из требуемых "
            f"{required_pages:.0f}"
        )

    required_seconds = int(total_pages * MIN_PROGRESS_RATIO * MIN_SECONDS_PER_PAGE)
    if progress.reading_seconds < required_seconds:
        return False, (
            f"засчитано {progress.reading_seconds} с чтения из требуемых "
            f"{required_seconds}"
        )

    return True, ""


async def _bump_daily_pages(db: AsyncSession, user: User, delta: int) -> None:
    """Прибавить прочитанные страницы к сегодняшнему счётчику.

    Прибавление считает БД, а не Python. Две причины.

    Во-первых, `daily.pages += delta` в коде — это чтение и запись двумя
    шагами. Параллельные обновления по РАЗНЫМ книгам блокируют разные строки
    прогресса и до счётчика доходят одновременно: оба читают одно значение,
    оба пишут своё, одна прибавка теряется.

    Во-вторых, здесь больше нет rollback. Прежняя ветка обработки конфликта
    откатывала транзакцию целиком — вместе с уже записанной страницей
    прогресса, начисленным XP и отметкой о дочитывании.
    """
    if delta <= 0:
        return

    today = datetime.now(UTC).date()
    stmt = pg_insert(DailyPagesRead).values(
        user_id=user.id, date=today, pages=delta
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[DailyPagesRead.user_id, DailyPagesRead.date],
        set_={"pages": DailyPagesRead.pages + stmt.excluded.pages},
    )
    await db.execute(stmt)


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

    Дневная статистика и счётчик продвижения пополняются не на разницу
    страниц, а на засчитанную её часть — иначе один запрос с прыжком в конец
    книги давал бы сотни «прочитанных» страниц.
    """
    book = await db.get(Book, book_id)
    if not book:
        raise BookNotFound(book_id)

    total_pages = resolve_total_pages(book, claimed_total_pages)
    total_verified = is_total_verified(book)
    if current_page < 1 or current_page > total_pages:
        raise InvalidPageNumber(f"Страница вне диапазона книги (1–{total_pages})")

    now = datetime.now(UTC)

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
    if not progress:
        progress = ReadingProgress(
            user_id=user.id,
            book_id=book_id,
            current_page=current_page,
            total_pages=total_pages,
            started=True,
            pages_advanced=_credited_advance(1, current_page),
            reading_seconds=0,
        )
        try:
            # SAVEPOINT, а не общий rollback: откатить нужно ровно неудавшуюся
            # вставку. Прежний db.rollback() сносил всю транзакцию — вместе с
            # тем, что уже было сделано выше.
            async with db.begin_nested():
                db.add(progress)
                await db.flush()
        except IntegrityError:
            # Параллельный запрос успел создать запись раньше — берём её.
            if progress in db:
                db.expunge(progress)
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
            await _apply_update(db, user, progress, current_page, total_pages, now)
        else:
            is_first_start = True
            await _bump_daily_pages(db, user, progress.pages_advanced)
    else:
        if not progress.started:
            progress.started = True
            is_first_start = True
        await _apply_update(db, user, progress, current_page, total_pages, now)

    if is_first_start:
        await add_xp(db, user, XP_FOR_STARTING_BOOK)
        await update_streak(db, user)
        await check_and_award_achievements(db, user, trigger="reading_started")

    # Книга считается дочитанной по факту дохода до последней страницы, а не
    # по отметке в списке — её можно поставить не открывая книгу. Но одного
    # попадания на последнюю страницу мало: см. _may_count_as_finished.
    reached_end = total_pages > 1 and current_page >= total_pages
    if reached_end and not progress.finished_at:
        allowed, reason = _may_count_as_finished(progress, total_pages, total_verified)
        if allowed:
            progress.finished_at = now
            await _mark_completed_in_list(db, user, book_id)
            await add_xp(db, user, XP_FOR_FINISHING_BOOK)
            await check_and_award_achievements(db, user, trigger="book_completed")
        else:
            logger.info(
                "Пользователь %s дошёл до конца книги %s, но завершение не "
                "засчитано: %s",
                user.id, book_id, reason,
            )

    await db.commit()
    await db.refresh(progress)
    return progress


async def _apply_update(
    db: AsyncSession,
    user: User,
    progress: ReadingProgress,
    current_page: int,
    total_pages: int,
    now: datetime,
) -> None:
    """Обновить существующую запись: страница, счётчики, дневная статистика."""
    previous_page = progress.current_page
    credited = _credited_advance(previous_page, current_page)

    progress.current_page = current_page
    progress.total_pages = total_pages
    progress.pages_advanced = (progress.pages_advanced or 0) + credited
    progress.reading_seconds = (progress.reading_seconds or 0) + _credited_seconds(
        progress.last_read_at, now
    )

    await _bump_daily_pages(db, user, credited)
