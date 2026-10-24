"""Счётчики использования интерфейса."""
from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.usage import UsageCounter
from app.models.user import User, UserRole
from app.schemas.usage import UsageEvent

DEFAULT_ACCENT = "orange"
DEFAULT_THEME = "dark"


async def record_usage(db: AsyncSession, events: list[UsageEvent]) -> None:
    """Прибавить счётчики за сегодня (UTC). Повторы в пачке складываются."""
    if not events:
        return
    totals: Counter[tuple[str, str]] = Counter()
    for event in events:
        totals[(event.kind, event.name)] += event.count
    today = datetime.now(UTC).date()
    for (kind, name), count in totals.items():
        stmt = insert(UsageCounter).values(day=today, kind=kind, name=name, count=count)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_usage_counter_day_kind_name",
            set_={"count": UsageCounter.count + stmt.excluded.count},
        )
        await db.execute(stmt)


async def usage_stats(db: AsyncSession, days: int, limit: int = 12) -> dict:
    start = datetime.now(UTC).date() - timedelta(days=days - 1)

    async def top(kind: str) -> list[dict]:
        total = func.sum(UsageCounter.count)
        rows = await db.execute(
            select(UsageCounter.name, total)
            .where(UsageCounter.kind == kind, UsageCounter.day >= start)
            .group_by(UsageCounter.name)
            .order_by(total.desc(), UsageCounter.name)
            .limit(limit)
        )
        return [{"name": name, "count": int(count)} for name, count in rows.all()]

    async def distribution(column, default: str) -> tuple[list[dict], int]:
        rows = await db.execute(
            select(column, func.count(User.id))
            .where(User.role != UserRole.ADMIN, column.is_not(None))
            .group_by(column)
        )
        counts = {value: int(count) for value, count in rows.all()}
        known = sum(counts.values())
        ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0] != default, item[0]))
        return [{"name": name, "count": count} for name, count in ordered], known

    accents, users_with_prefs = await distribution(User.ui_accent, DEFAULT_ACCENT)
    themes, _ = await distribution(User.ui_theme, DEFAULT_THEME)
    return {
        "days": days,
        "screens": await top("screen"),
        "actions": await top("action"),
        "accents": accents,
        "themes": themes,
        "users_with_prefs": users_with_prefs,
    }
