"""Постоянная история завершения книг и границы отчётного периода."""
from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.models.book import Book
from app.services.excel_export import parse_period
from tests.conftest import auth_headers


async def test_completion_timestamp_survives_later_status_changes(
    client, db, approved_user
):
    book = Book(title="История", author="Автор", description="")
    db.add(book)
    await db.commit()
    await db.refresh(book)

    completed = await client.put(
        f"/books/{book.id}/mylist",
        headers=auth_headers(approved_user),
        json={"status": "completed"},
    )
    assert completed.status_code == 200
    completed_at = completed.json()["completed_at"]
    assert completed_at

    planned = await client.put(
        f"/books/{book.id}/mylist",
        headers=auth_headers(approved_user),
        json={"status": "planned"},
    )
    assert planned.status_code == 200
    assert planned.json()["completed_at"] == completed_at

    completed_again = await client.put(
        f"/books/{book.id}/mylist",
        headers=auth_headers(approved_user),
        json={"status": "completed"},
    )
    assert completed_again.json()["completed_at"] == completed_at


def test_export_end_date_includes_entire_day():
    start, end = parse_period("2026-09-01", "2026-09-30")
    assert start == datetime(2026, 9, 1, tzinfo=UTC)
    assert end == datetime(2026, 10, 1, tzinfo=UTC)


@pytest.mark.parametrize("removed", ["dropped", "liked"])
async def test_removed_statuses_are_gone(client, db, approved_user, removed):
    """«Брошено» и «Избранное» убраны: сервер такие статусы больше не принимает."""
    book = Book(title="Без «Брошено»", author="Автор", description="")
    db.add(book)
    await db.commit()
    await db.refresh(book)
    response = await client.put(
        f"/books/{book.id}/mylist", headers=auth_headers(approved_user), json={"status": removed},
    )
    assert response.status_code == 422
