"""XP, levels, streaks, achievements — server-side mirror of frontend logic."""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.achievement import Achievement, UserAchievement
from app.models.user import User


def xp_required_for_level(level: int) -> int:
    """Linear curve, mirrors frontend getXpForLevel: level * 100."""
    return level * 100


def calculate_level(xp: int) -> dict[str, int]:
    """Return (level, current_level_xp, next_level_xp) for total xp."""
    level = 1
    remaining = xp
    while remaining >= xp_required_for_level(level):
        remaining -= xp_required_for_level(level)
        level += 1
    return {
        "level": level,
        "current_level_xp": remaining,
        "next_level_xp": xp_required_for_level(level),
    }


async def add_xp(db: AsyncSession, user: User, amount: int) -> None:
    """Increment user XP and persist. Caller is responsible for commit."""
    user.xp += amount


async def update_streak(db: AsyncSession, user: User) -> None:
    """Update reading streak. Same logic as frontend updateStreak."""
    today = datetime.now(timezone.utc).date()
    last = user.streak_last_date.date() if user.streak_last_date else None

    if last == today:
        return  # уже отметились сегодня
    yesterday = today - timedelta(days=1)
    user.streak_count = user.streak_count + 1 if last == yesterday else 1
    user.streak_last_date = datetime.now(timezone.utc)
    user.xp += 5  # бонус за стрик


# Триггеры — что засчитывает достижение (первое действие данного типа)
ACHIEVEMENT_TRIGGERS: dict[str, str] = {
    "reading_started": "ach_reading_1",
    "quiz_completed": "ach_quiz_1",
    "review_added": "review_1",
    "annotation_added": "ach_note_1",      # первая заметка/выделение
    "book_completed": "ach_finish_1",       # первая дочитанная книга
    "level_assessed": "ach_level_test",     # прошёл тест уровня кибербеза
}


async def _count_books_started(db: AsyncSession, user_id: int) -> int:
    from app.models.library import ReadingProgress
    return await db.scalar(
        select(func.count()).select_from(ReadingProgress).where(
            ReadingProgress.user_id == user_id, ReadingProgress.started.is_(True)
        )
    ) or 0


async def _count_books_completed(db: AsyncSession, user_id: int) -> int:
    from app.models.library import MyListEntry, MyListStatus
    return await db.scalar(
        select(func.count()).select_from(MyListEntry).where(
            MyListEntry.user_id == user_id, MyListEntry.status == MyListStatus.COMPLETED
        )
    ) or 0


async def _count_quizzes_passed(db: AsyncSession, user_id: int) -> int:
    from app.models.quiz import QuizAttempt
    return await db.scalar(
        select(func.count()).select_from(QuizAttempt).where(
            QuizAttempt.user_id == user_id, QuizAttempt.percentage >= 60
        )
    ) or 0


async def _count_quizzes_perfect(db: AsyncSession, user_id: int) -> int:
    from app.models.quiz import QuizAttempt
    return await db.scalar(
        select(func.count()).select_from(QuizAttempt).where(
            QuizAttempt.user_id == user_id, QuizAttempt.percentage == 100
        )
    ) or 0


async def _count_reviews(db: AsyncSession, user_id: int) -> int:
    from app.models.library import Review
    return await db.scalar(
        select(func.count()).select_from(Review).where(Review.user_id == user_id)
    ) or 0


async def check_and_award_achievements(
    db: AsyncSession, user: User, trigger: str | None = None
) -> list[str]:
    """Award achievements based on a trigger or threshold check. Returns list of new codes."""
    # Все ачивки пользователя
    existing = await db.execute(
        select(Achievement.code)
        .join(UserAchievement, UserAchievement.achievement_id == Achievement.id)
        .where(UserAchievement.user_id == user.id)
    )
    owned_codes = {row[0] for row in existing.all()}

    new_codes: list[str] = []

    def grant(code: str, condition: bool) -> None:
        if condition and code not in owned_codes and code not in new_codes:
            new_codes.append(code)

    # 1. Триггерные ачивки (первое действие данного типа)
    if trigger and trigger in ACHIEVEMENT_TRIGGERS:
        grant(ACHIEVEMENT_TRIGGERS[trigger], True)

    # 2. Пороговые по XP / уровню
    grant("xp_500", user.xp >= 500)
    grant("xp_1000", user.xp >= 1000)
    grant("xp_2500", user.xp >= 2500)
    grant("xp_5000", user.xp >= 5000)
    grant("xp_10000", user.xp >= 10000)

    # 3. Пороговые по стрику
    streak = getattr(user, "streak_count", 0) or 0
    grant("streak_3", streak >= 3)
    grant("streak_7", streak >= 7)
    grant("streak_14", streak >= 14)
    grant("streak_30", streak >= 30)
    grant("streak_100", streak >= 100)

    # 4. Пороговые по счётчикам (считаем только если триггер релевантный или это явная проверка)
    #    чтобы не дёргать БД на каждый чих — группируем.
    if trigger in (None, "reading_started", "book_completed"):
        started = await _count_books_started(db, user.id)
        grant("books_5", started >= 5)
        grant("books_10", started >= 10)
        grant("books_25", started >= 25)
        completed = await _count_books_completed(db, user.id)
        grant("finish_5", completed >= 5)
        grant("finish_10", completed >= 10)
        grant("finish_25", completed >= 25)

    if trigger in (None, "quiz_completed"):
        passed = await _count_quizzes_passed(db, user.id)
        grant("quiz_5", passed >= 5)
        grant("quiz_10", passed >= 10)
        grant("quiz_25", passed >= 25)
        perfect = await _count_quizzes_perfect(db, user.id)
        grant("quiz_perfect", perfect >= 1)
        grant("quiz_perfect_5", perfect >= 5)

    if trigger in (None, "review_added"):
        reviews = await _count_reviews(db, user.id)
        grant("review_5", reviews >= 5)
        grant("review_10", reviews >= 10)

    # Создаём UserAchievement-записи
    for code in new_codes:
        ach = await db.scalar(select(Achievement).where(Achievement.code == code))
        if ach:
            db.add(UserAchievement(user_id=user.id, achievement_id=ach.id))

    return new_codes