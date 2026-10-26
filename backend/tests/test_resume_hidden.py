"""Книги, убранные из блока «Продолжить», хранятся в аккаунте."""
import pytest

from tests.conftest import auth_headers, make_user


@pytest.mark.asyncio
async def test_hidden_books_survive_across_sessions(client, db):
    user = await make_user(db, username="resume_hidden_user")

    me = (await client.get("/auth/me", headers=auth_headers(user))).json()
    assert me["resume_hidden"] is None

    saved = await client.patch("/me", headers=auth_headers(user), json={"resume_hidden": [7, 3, 7]})
    assert saved.status_code == 200
    assert saved.json()["resume_hidden"] == [7, 3]

    again = (await client.get("/auth/me", headers=auth_headers(user))).json()
    assert again["resume_hidden"] == [7, 3]

    # Пустой список — «ничего не скрыто», а не «не трогать».
    cleared = (await client.patch("/me", headers=auth_headers(user), json={"resume_hidden": []})).json()
    assert cleared["resume_hidden"] == []

    # Другие поля профиля список не сбрасывают.
    await client.patch("/me", headers=auth_headers(user), json={"resume_hidden": [5]})
    other = (await client.patch("/me", headers=auth_headers(user), json={"ui_theme": "light"})).json()
    assert other["resume_hidden"] == [5]


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [
    {"resume_hidden": [0]},
    {"resume_hidden": [-1]},
    {"resume_hidden": ["x"]},
    {"resume_hidden": list(range(1, 1002))},
])
async def test_hidden_books_validated(client, db, payload):
    user = await make_user(db, username="resume_hidden_bad")
    response = await client.patch("/me", headers=auth_headers(user), json=payload)
    assert response.status_code == 422
