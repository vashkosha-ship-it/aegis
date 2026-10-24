"""Вкладка «Аналитика»: данные по всем читателям, а не по текущему админу."""
from datetime import UTC, datetime, timedelta

import pytest

from app.models.book import Book
from app.models.library import DailyPagesRead, MyListEntry, MyListStatus, ReadingProgress
from tests.conftest import auth_headers, make_user


@pytest.mark.asyncio
async def test_analytics_counts_readers_and_skips_admins(client, db, admin_user):
    alice = await make_user(db, username="alice")
    bob = await make_user(db, username="bob")
    popular = Book(title="Популярная", author="А", description="", views=10)
    quiet = Book(title="Тихая", author="Б", description="", views=2)
    db.add_all([popular, quiet])
    await db.flush()

    today = datetime.now(UTC).date()
    db.add_all([
        ReadingProgress(user_id=alice.id, book_id=popular.id, current_page=40, total_pages=100, started=True),
        ReadingProgress(user_id=bob.id, book_id=popular.id, current_page=2, total_pages=100, started=True),
        ReadingProgress(user_id=bob.id, book_id=quiet.id, current_page=9, total_pages=10, started=True),
        # Прогресс администратора в аналитику не попадает.
        ReadingProgress(user_id=admin_user.id, book_id=quiet.id, current_page=50, total_pages=60, started=True),
        DailyPagesRead(user_id=alice.id, date=today, pages=12),
        DailyPagesRead(user_id=bob.id, date=today, pages=3),
        DailyPagesRead(user_id=bob.id, date=today - timedelta(days=2), pages=5),
        DailyPagesRead(user_id=alice.id, date=today - timedelta(days=30), pages=99),
        DailyPagesRead(user_id=admin_user.id, date=today, pages=500),
        MyListEntry(user_id=bob.id, book_id=quiet.id, status=MyListStatus.COMPLETED),
        MyListEntry(user_id=admin_user.id, book_id=popular.id, status=MyListStatus.COMPLETED),
    ])
    await db.commit()

    response = await client.get("/admin/analytics", headers=auth_headers(admin_user))

    assert response.status_code == 200
    data = response.json()
    assert len(data["activity"]) == 7
    assert data["activity"][-1] == {"date": today.isoformat(), "pages": 15}
    assert data["activity"][-3]["pages"] == 5
    assert data["top_books"][0] == {"book_id": popular.id, "title": "Популярная", "readers": 2}
    assert data["funnel"] == {"views": 12, "opened": 3, "reading": 2, "completed": 1}


@pytest.mark.asyncio
async def test_analytics_is_admin_only(client, approved_user):
    response = await client.get("/admin/analytics", headers=auth_headers(approved_user))
    assert response.status_code == 403
