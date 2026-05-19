"""XP, levels, streaks, achievements — server-side mirror of frontend logic."""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
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


# Триггеры — что засчитывает достижение
ACHIEVEMENT_TRIGGERS: dict[str, str] = {
    "reading_started": "ach_reading_1",
    "quiz_completed": "ach_quiz_1",
    "review_added": "review_1",
}


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

    # 1. Триггерные ачивки
    if trigger and trigger in ACHIEVEMENT_TRIGGERS:
        code = ACHIEVEMENT_TRIGGERS[trigger]
        if code not in owned_codes:
            new_codes.append(code)

    # 2. Пороговые (XP)
    if user.xp >= 1000 and "xp_1000" not in owned_codes:
        new_codes.append("xp_1000")

    # Создаём UserAchievement-записи
    for code in new_codes:
        ach = await db.scalar(select(Achievement).where(Achievement.code == code))
        if ach:
            db.add(UserAchievement(user_id=user.id, achievement_id=ach.id))

    return new_codes
