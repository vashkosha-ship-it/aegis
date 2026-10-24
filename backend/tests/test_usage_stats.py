"""Статистика использования: обезличенные счётчики и выбор оформления."""
import pytest
from sqlalchemy import select

from app.models.usage import UsageCounter
from app.models.user import User
from tests.conftest import auth_headers, make_user


@pytest.mark.asyncio
async def test_usage_is_counted_without_user_and_prefs_saved(client, db, admin_user):
    alice = await make_user(db, username="alice_u")
    bob = await make_user(db, username="bob_u")

    first = await client.post("/me/usage", headers=auth_headers(alice), json={
        "events": [
            {"kind": "screen", "name": "home"},
            {"kind": "screen", "name": "home"},
            {"kind": "action", "name": "openARWithScheme", "count": 3},
        ],
        "prefs": {"theme": "dark", "accent": "blue"},
    })
    second = await client.post("/me/usage", headers=auth_headers(bob), json={
        "events": [{"kind": "screen", "name": "home"}, {"kind": "screen", "name": "profile"}],
        "prefs": {"theme": "light", "accent": "blue"},
    })
    await client.post("/me/usage", headers=auth_headers(admin_user), json={
        "events": [], "prefs": {"accent": "green"},
    })
    assert first.status_code == second.status_code == 204

    rows = (await db.execute(select(UsageCounter.kind, UsageCounter.name, UsageCounter.count))).all()
    assert ("screen", "home", 3) in rows
    # В счётчиках нет ни id, ни логина пользователя.
    assert {column.name for column in UsageCounter.__table__.columns} == {"id", "day", "kind", "name", "count"}

    stats = (await client.get("/admin/usage?days=7", headers=auth_headers(admin_user))).json()
    assert stats["screens"][0] == {"name": "home", "count": 3}
    assert stats["actions"] == [{"name": "openARWithScheme", "count": 3}]
    # Администраторы в распределение цветов не входят.
    assert stats["accents"] == [{"name": "blue", "count": 2}]
    assert {item["name"] for item in stats["themes"]} == {"dark", "light"}
    assert stats["users_with_prefs"] == 2

    db.expire_all()
    saved = await db.scalar(select(User).where(User.username == "alice_u"))
    assert (saved.ui_theme, saved.ui_accent) == ("dark", "blue")


@pytest.mark.asyncio
@pytest.mark.parametrize("event", [
    {"kind": "click", "name": "home"},
    {"kind": "screen", "name": "Иван Иванов"},
    {"kind": "screen", "name": "a" * 65},
    {"kind": "screen", "name": "home", "count": 1000},
])
async def test_usage_rejects_free_text_and_huge_counts(client, approved_user, event):
    response = await client.post("/me/usage", headers=auth_headers(approved_user), json={"events": [event]})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_usage_requires_login_and_admin(client, approved_user):
    assert (await client.post("/me/usage", json={"events": []})).status_code == 401
    assert (await client.get("/admin/usage", headers=auth_headers(approved_user))).status_code == 403
