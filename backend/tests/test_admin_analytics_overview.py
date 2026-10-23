"""Аналитика админки: активность всей библиотеки и удержание."""
from datetime import UTC, datetime, timedelta

import pytest

from app.models.library import DailyPagesRead
from tests.conftest import auth_headers, make_user


@pytest.mark.asyncio
async def test_overview_counts_all_readers_and_retention(client, db, admin_user):
    today = datetime.now(UTC).date()
    old_reader = await make_user(db, username="old_reader")
    old_reader.created_at = datetime.now(UTC) - timedelta(days=40)
    gone = await make_user(db, username="gone")
    gone.created_at = datetime.now(UTC) - timedelta(days=40)
    db.add_all([
        DailyPagesRead(user_id=old_reader.id, date=today, pages=12),
        DailyPagesRead(user_id=old_reader.id, date=today - timedelta(days=1), pages=3),
        DailyPagesRead(user_id=gone.id, date=today - timedelta(days=39), pages=5),
    ])
    await db.commit()

    response = await client.get("/admin/analytics/overview", headers=auth_headers(admin_user))

    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data["activity"]) == 7
    assert data["activity"][-1] == {"date": today.isoformat(), "pages": 12}
    assert data["activity"][-2]["pages"] == 3
    day30 = next(item for item in data["retention"] if item["day"] == 30)
    # Оба зарегистрированы 40 дней назад; на 30-й день и позже читал один.
    assert day30["retained"] == 1
    assert day30["eligible"] >= 2
    day90 = next(item for item in data["retention"] if item["day"] == 90)
    assert day90["retained"] == 0


@pytest.mark.asyncio
async def test_overview_is_admin_only(client, approved_user):
    response = await client.get("/admin/analytics/overview", headers=auth_headers(approved_user))
    assert response.status_code == 403
