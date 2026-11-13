"""Админка → «Активность»: журнал действий пользователей."""
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models.book import Book
from app.models.user_activity import UserActivityEvent
from app.services.user_activity import describe_device, purge_old_activity
from tests.conftest import auth_headers

ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36"
WINDOWS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"


def _ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def test_describe_device():
    assert describe_device(ANDROID_UA, "app") == "Android · приложение"
    assert describe_device(WINDOWS_UA, "browser") == "Windows · Chrome"
    ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"
    assert describe_device(ipad, "browser") == "iPad · Safari"
    assert describe_device("", None) == "Неизвестное устройство · браузер"


@pytest.mark.asyncio
async def test_activity_is_recorded_and_shown_to_admin(client, db, approved_user, admin_user):
    book = Book(title="Сети", author="А", pdf_storage_key="books/pdf/n.pdf")
    db.add(book)
    await db.commit()
    now = datetime.now(UTC)
    payload = {
        "session_id": "sess-abc-123",
        "display": "app",
        "activity": [
            {"kind": "session", "name": "start", "at": _ms(now - timedelta(minutes=10))},
            {"kind": "screen", "name": "home", "at": _ms(now - timedelta(minutes=9))},
            {"kind": "book", "name": "detail", "book_id": book.id, "at": _ms(now - timedelta(minutes=8))},
            {"kind": "book", "name": "read", "book_id": book.id, "at": _ms(now - timedelta(minutes=7))},
            {"kind": "action", "name": "openTOC", "at": _ms(now - timedelta(minutes=6))},
            # Удалённая книга и неверные часы на устройстве не ломают запись.
            {"kind": "book", "name": "detail", "book_id": 999999, "at": _ms(now + timedelta(days=400))},
        ],
    }
    response = await client.post(
        "/me/usage", json=payload,
        headers={**auth_headers(approved_user), "User-Agent": ANDROID_UA},
    )
    assert response.status_code == 204, response.text

    rows = (await db.scalars(select(UserActivityEvent).order_by(UserActivityEvent.id))).all()
    assert len(rows) == 6
    assert rows[0].detail == "Android · приложение"
    assert rows[-1].book_id is None
    assert abs((rows[-1].created_at - now).total_seconds()) < 60

    # Читателю журнал недоступен.
    assert (await client.get("/admin/activity", headers=auth_headers(approved_user))).status_code == 403

    summary = (await client.get("/admin/activity", headers=auth_headers(admin_user))).json()
    assert len(summary) == 1
    row = summary[0]
    assert row["username"] == approved_user.username
    assert (row["sessions"], row["events"], row["books_opened"]) == (1, 6, 1)
    assert row["device"] == "Android · приложение"

    detail = (await client.get(f"/admin/activity/{approved_user.id}", headers=auth_headers(admin_user))).json()
    assert len(detail["sessions"]) == 1
    session = detail["sessions"][0]
    assert session["device"] == "Android · приложение"
    names = [(e["kind"], e["name"], e["book_title"]) for e in session["events"]]
    assert names[:4] == [
        ("screen", "home", None), ("book", "detail", "Сети"),
        ("book", "read", "Сети"), ("action", "openTOC", None),
    ]
    assert (await client.get("/admin/activity/987654", headers=auth_headers(admin_user))).status_code == 404


@pytest.mark.asyncio
async def test_free_text_is_rejected(client, approved_user):
    payload = {
        "session_id": "sess-abc-123",
        "activity": [{"kind": "action", "name": "поиск: мой пароль 123"}],
    }
    response = await client.post("/me/usage", json=payload, headers=auth_headers(approved_user))
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_old_activity_is_purged(db, approved_user):
    old = UserActivityEvent(
        user_id=approved_user.id, session_id="s-old-0001", kind="screen", name="home",
        created_at=datetime.now(UTC) - timedelta(days=120),
    )
    fresh = UserActivityEvent(
        user_id=approved_user.id, session_id="s-new-0001", kind="screen", name="home",
        created_at=datetime.now(UTC) - timedelta(days=5),
    )
    db.add_all([old, fresh])
    await db.commit()

    assert await purge_old_activity(db) == 1
    left = (await db.scalars(select(UserActivityEvent.session_id))).all()
    assert left == ["s-new-0001"]
