"""Миграция проставляет «Читаю» начатым книгам без статуса."""
import importlib.util
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import select, text

from app.models.book import Book
from app.models.library import MyListEntry, MyListStatus, ReadingProgress
from tests.conftest import make_user

MIGRATION = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "backfill_reading_status.py"


def _backfill_sql() -> str:
    spec = importlib.util.spec_from_file_location("backfill_reading_status", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.BACKFILL_SQL


@pytest.mark.asyncio
async def test_backfill_marks_started_books_as_reading(db):
    user = await make_user(db, username="reader_bf")
    started, finished, planned, untouched = (
        Book(title=f"Книга {i}", author="А", description="") for i in range(4)
    )
    db.add_all([started, finished, planned, untouched])
    await db.flush()
    db.add_all([
        ReadingProgress(user_id=user.id, book_id=started.id, current_page=12, total_pages=100, started=True),
        ReadingProgress(user_id=user.id, book_id=finished.id, current_page=100, total_pages=100,
                        started=True, finished_at=datetime.now(UTC)),
        ReadingProgress(user_id=user.id, book_id=planned.id, current_page=3, total_pages=100, started=True),
        MyListEntry(user_id=user.id, book_id=planned.id, status=MyListStatus.PLANNED),
    ])
    await db.commit()

    await db.execute(text(_backfill_sql()))
    await db.commit()

    rows = (await db.execute(
        select(MyListEntry.book_id, MyListEntry.status).where(MyListEntry.user_id == user.id)
    )).all()
    statuses = dict(rows)
    assert statuses[started.id] == MyListStatus.READING
    assert statuses[planned.id] == MyListStatus.PLANNED  # выбранный пользователем статус не трогаем
    assert finished.id not in statuses
    assert untouched.id not in statuses
