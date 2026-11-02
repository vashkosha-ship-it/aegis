"""ФИО в приложении не спрашивается, не хранится и нигде не отдаётся."""
import pytest

from app.models.user import User, UserRole
from tests.conftest import auth_headers, make_user


def test_user_model_has_no_full_name():
    assert "full_name" not in User.__table__.columns


@pytest.mark.asyncio
async def test_api_responses_have_no_full_name(client, db):
    owner = await make_user(db, username="nofio_owner")
    admin = await make_user(db, username="nofio_admin", role=UserRole.ADMIN)

    me = (await client.get("/me", headers=auth_headers(owner))).json()
    assert "full_name" not in me

    profile = (await client.get(f"/users/{owner.id}/profile", headers=auth_headers(admin))).json()
    assert "full_name" not in profile
    assert profile["username"] == "nofio_owner"

    board = (await client.get("/me/leaderboard", headers=auth_headers(owner))).json()
    assert board and all("full_name" not in row for row in board)

    users = (await client.get("/admin/users", headers=auth_headers(admin))).json()
    assert users and all("full_name" not in row for row in users)


@pytest.mark.asyncio
async def test_full_name_sent_by_old_client_is_ignored(client, db):
    user = await make_user(db, username="nofio_patch")
    r = await client.patch("/me", headers=auth_headers(user), json={"full_name": "Иванов Иван"})
    assert r.status_code == 200
    assert "full_name" not in r.json()
