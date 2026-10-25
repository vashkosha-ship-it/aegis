"""Удаление аккаунта самим пользователем."""
import pytest
from sqlalchemy import select

from app.models.user import User
from tests.conftest import auth_headers, make_user


@pytest.mark.asyncio
async def test_reader_deletes_own_account(client, db):
    user = await make_user(db, username="leaving_reader")
    user_id = user.id
    headers = auth_headers(user)

    wrong = await client.post("/me/delete", headers=headers, json={"password": "nope", "confirm": "УДАЛИТЬ"})
    assert wrong.status_code == 401
    typo = await client.post("/me/delete", headers=headers, json={"password": "TestPass123!", "confirm": "удали"})
    assert typo.status_code == 400

    done = await client.post("/me/delete", headers=headers, json={"password": "TestPass123!", "confirm": "удалить"})
    assert done.status_code == 204
    db.expire_all()
    assert await db.scalar(select(User).where(User.id == user_id)) is None


@pytest.mark.asyncio
async def test_admin_cannot_delete_self(client, admin_user):
    response = await client.post(
        "/me/delete", headers=auth_headers(admin_user),
        json={"password": "TestPass123!", "confirm": "УДАЛИТЬ"},
    )
    assert response.status_code == 400
