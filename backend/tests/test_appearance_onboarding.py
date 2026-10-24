"""Экран выбора оформления: флаг аккаунта и сохранение темы/цвета."""
import pytest

from tests.conftest import auth_headers, make_user


@pytest.mark.asyncio
async def test_new_account_sees_appearance_screen_once(client, db):
    alice = await make_user(db, username="alice_appearance")

    me = (await client.get("/auth/me", headers=auth_headers(alice))).json()
    assert me["appearance_onboarded"] is False
    assert me["ui_theme"] is None and me["ui_accent"] is None

    saved = await client.patch("/me", headers=auth_headers(alice), json={
        "ui_theme": "light", "ui_accent": "violet", "appearance_onboarded": True,
    })
    assert saved.status_code == 200
    body = saved.json()
    assert (body["ui_theme"], body["ui_accent"], body["appearance_onboarded"]) == ("light", "violet", True)

    again = (await client.get("/auth/me", headers=auth_headers(alice))).json()
    assert again["appearance_onboarded"] is True
    assert again["ui_accent"] == "violet"


@pytest.mark.asyncio
async def test_skip_marks_onboarded_without_changing_prefs(client, db):
    bob = await make_user(db, username="bob_appearance")
    body = (await client.patch("/me", headers=auth_headers(bob), json={"appearance_onboarded": True})).json()
    assert body["appearance_onboarded"] is True
    assert body["ui_theme"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [
    {"ui_theme": "neon"},
    {"ui_accent": "pink"},
    {"appearance_onboarded": False},
])
async def test_appearance_rejects_unknown_values(client, db, payload):
    carol = await make_user(db, username="carol_appearance")
    response = await client.patch("/me", headers=auth_headers(carol), json=payload)
    assert response.status_code == 422
