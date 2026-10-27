"""ФИО пользователей видит только администратор (и сам человек)."""
import pytest

from app.models.book import Book
from app.models.user import UserRole
from tests.conftest import auth_headers, make_user


@pytest.mark.asyncio
async def test_public_profile_hides_full_name_from_other_readers(client, db):
    owner = await make_user(db, username="fio_owner", full_name="Иванов Иван Иванович")
    reader = await make_user(db, username="fio_reader")
    admin = await make_user(db, username="fio_admin", role=UserRole.ADMIN)

    as_reader = (await client.get(f"/users/{owner.id}/profile", headers=auth_headers(reader))).json()
    assert as_reader["full_name"] is None
    assert as_reader["username"] == "fio_owner"

    as_admin = (await client.get(f"/users/{owner.id}/profile", headers=auth_headers(admin))).json()
    assert as_admin["full_name"] == "Иванов Иван Иванович"

    as_self = (await client.get(f"/users/{owner.id}/profile", headers=auth_headers(owner))).json()
    assert as_self["full_name"] == "Иванов Иван Иванович"


@pytest.mark.asyncio
async def test_leaderboard_hides_full_names_from_readers(client, db):
    leader = await make_user(db, username="fio_leader", full_name="Петров Пётр")
    leader.xp = 10_000
    reader = await make_user(db, username="fio_reader2", full_name="Сидоров Сидор")
    admin = await make_user(db, username="fio_admin2", role=UserRole.ADMIN)
    await db.commit()

    rows = (await client.get("/me/leaderboard", headers=auth_headers(reader))).json()
    by_name = {row["username"]: row for row in rows}
    assert by_name["fio_leader"]["full_name"] is None
    assert by_name["fio_reader2"]["full_name"] == "Сидоров Сидор"   # себя видно

    rows = (await client.get("/me/leaderboard", headers=auth_headers(admin))).json()
    assert {row["username"]: row for row in rows}["fio_leader"]["full_name"] == "Петров Пётр"


@pytest.mark.asyncio
async def test_discussion_hides_full_name_from_readers(client, db):
    author = await make_user(db, username="fio_commenter", full_name="Кузнецов Кузьма")
    reader = await make_user(db, username="fio_reader3")
    admin = await make_user(db, username="fio_admin3", role=UserRole.ADMIN)
    book = Book(title="Книга для обсуждения", author="А", description="")
    db.add(book)
    await db.commit()

    created = await client.post(
        f"/books/{book.id}/comments", headers=auth_headers(author), json={"text": "Хорошая книга"},
    )
    assert created.status_code in (200, 201), created.text

    as_reader = (await client.get(f"/books/{book.id}/comments", headers=auth_headers(reader))).json()
    assert as_reader[0]["author"]["full_name"] is None
    assert as_reader[0]["author"]["username"] == "fio_commenter"

    as_admin = (await client.get(f"/books/{book.id}/comments", headers=auth_headers(admin))).json()
    assert as_admin[0]["author"]["full_name"] == "Кузнецов Кузьма"
