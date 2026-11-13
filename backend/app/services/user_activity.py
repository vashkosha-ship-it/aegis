"""Журнал действий пользователей: запись из браузера и выдача для админки."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.models.user import User
from app.models.user_activity import ACTIVITY_RETENTION_DAYS, UserActivityEvent
from app.schemas.usage import ActivityEvent

# Браузер копит события до 2 минут, при плохой сети — дольше. Время
# старше суток или из будущего считаем ошибкой часов устройства.
MAX_CLIENT_LAG = timedelta(hours=24)
MAX_CLIENT_AHEAD = timedelta(minutes=5)
MAX_SESSIONS = 60
MAX_TIMELINE_EVENTS = 3000


def describe_device(user_agent: str, display: str | None) -> str:
    """Короткое имя устройства по User-Agent: «Android · приложение»."""
    ua = user_agent or ""
    if "iPad" in ua or ("Macintosh" in ua and "Mobile" in ua):
        system = "iPad"
    elif "iPhone" in ua:
        system = "iPhone"
    elif "Android" in ua:
        system = "Android"
    elif "Windows" in ua:
        system = "Windows"
    elif "Mac OS X" in ua or "Macintosh" in ua:
        system = "Mac"
    elif "Linux" in ua:
        system = "Linux"
    else:
        system = "Неизвестное устройство"
    if display == "app":
        return f"{system} · приложение"
    if "YaBrowser" in ua:
        browser = "Яндекс Браузер"
    elif "Edg/" in ua:
        browser = "Edge"
    elif "OPR/" in ua:
        browser = "Opera"
    elif "Firefox/" in ua:
        browser = "Firefox"
    elif "Chrome/" in ua or "CriOS" in ua:
        browser = "Chrome"
    elif "Safari/" in ua:
        browser = "Safari"
    else:
        browser = "браузер"
    return f"{system} · {browser}"


def _event_time(at_ms: int | None, now: datetime) -> datetime:
    if at_ms is None:
        return now
    try:
        at = datetime.fromtimestamp(at_ms / 1000, UTC)
    except (OverflowError, OSError, ValueError):
        return now
    if at > now + MAX_CLIENT_AHEAD or at < now - MAX_CLIENT_LAG:
        return now
    return min(at, now)


async def record_activity(
    db: AsyncSession,
    user: User,
    session_id: str | None,
    events: list[ActivityEvent],
    *,
    user_agent: str = "",
    display: str | None = None,
) -> int:
    if not session_id or not events:
        return 0
    now = datetime.now(UTC)
    book_ids = {e.book_id for e in events if e.book_id}
    known = set()
    if book_ids:
        known = set((await db.scalars(select(Book.id).where(Book.id.in_(book_ids)))).all())
    device = describe_device(user_agent, display)
    for event in events:
        db.add(UserActivityEvent(
            user_id=user.id,
            session_id=session_id,
            kind=event.kind,
            name=event.name,
            book_id=event.book_id if event.book_id in known else None,
            detail=device if event.kind == "session" else None,
            created_at=_event_time(event.at, now),
        ))
    return len(events)


async def purge_old_activity(db: AsyncSession) -> int:
    cutoff = datetime.now(UTC) - timedelta(days=ACTIVITY_RETENTION_DAYS)
    result = await db.execute(delete(UserActivityEvent).where(UserActivityEvent.created_at < cutoff))
    await db.commit()
    return result.rowcount or 0


async def activity_summary(db: AsyncSession, days: int) -> list[dict]:
    """По пользователю: когда был, сколько сеансов, действий и книг."""
    since = datetime.now(UTC) - timedelta(days=days)
    E = UserActivityEvent
    rows = await db.execute(
        select(
            E.user_id,
            func.max(E.created_at),
            func.count(func.distinct(E.session_id)),
            func.count(E.id),
            func.count(func.distinct(E.book_id)),
        )
        .where(E.created_at >= since)
        .group_by(E.user_id)
    )
    stats = {r[0]: r for r in rows.all()}
    if not stats:
        return []
    users = {u.id: u for u in (await db.scalars(select(User).where(User.id.in_(stats)))).all()}
    # Устройство последнего сеанса.
    last_device = {}
    device_rows = await db.execute(
        select(E.user_id, E.detail, E.created_at)
        .where(E.kind == "session", E.created_at >= since, E.user_id.in_(stats))
        .order_by(E.created_at)
    )
    for user_id, detail, _ in device_rows.all():
        last_device[user_id] = detail
    summary = []
    for user_id, last_seen, sessions, events, books in stats.values():
        user = users.get(user_id)
        if not user:
            continue
        summary.append({
            "user_id": user_id,
            "username": user.username,
            "last_seen": last_seen,
            "sessions": int(sessions),
            "events": int(events),
            "books_opened": int(books),
            "device": last_device.get(user_id),
        })
    summary.sort(key=lambda item: item["last_seen"], reverse=True)
    return summary


async def activity_detail(db: AsyncSession, user: User, days: int) -> dict:
    """Сеансы пользователя с хронологией: новые сверху."""
    since = datetime.now(UTC) - timedelta(days=days)
    E = UserActivityEvent
    rows = (await db.execute(
        select(E, Book.title)
        .outerjoin(Book, Book.id == E.book_id)
        .where(E.user_id == user.id, E.created_at >= since)
        .order_by(E.created_at.desc(), E.id.desc())
        .limit(MAX_TIMELINE_EVENTS + 1)
    )).all()
    truncated = len(rows) > MAX_TIMELINE_EVENTS
    rows = rows[:MAX_TIMELINE_EVENTS]
    sessions: dict[str, dict] = {}
    for event, title in reversed(rows):
        session = sessions.get(event.session_id)
        if session is None:
            if len(sessions) >= MAX_SESSIONS * 2:
                continue
            session = sessions[event.session_id] = {
                "session_id": event.session_id,
                "started_at": event.created_at,
                "ended_at": event.created_at,
                "device": None,
                "events": [],
            }
        session["ended_at"] = max(session["ended_at"], event.created_at)
        session["started_at"] = min(session["started_at"], event.created_at)
        if event.kind == "session":
            session["device"] = event.detail
            continue
        session["events"].append({
            "at": event.created_at,
            "kind": event.kind,
            "name": event.name,
            "book_id": event.book_id,
            "book_title": title,
        })
    ordered = sorted(sessions.values(), key=lambda s: s["started_at"], reverse=True)
    return {
        "user_id": user.id,
        "username": user.username,
        "days": days,
        "sessions": ordered[:MAX_SESSIONS],
        "truncated": truncated or len(ordered) > MAX_SESSIONS,
    }
