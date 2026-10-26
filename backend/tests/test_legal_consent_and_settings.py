"""Согласие на обработку персональных данных и выключатель ИИ-ассистента."""
from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.core.legal import LEGAL_VERSION
from app.models.admin_log import AdminLog
from app.models.user import User
from tests.conftest import auth_headers, make_user


def _registration(**extra):
    return {
        "username": "consenter",
        "password": "TestPass123!",
        "email": "consenter@example.com",
        **extra,
    }


# --- Регистрация --------------------------------------------------------------

@pytest.mark.parametrize("extra", [
    {},
    {"accept_terms": True},
    {"pd_consent": True},
    {"accept_terms": True, "pd_consent": False},
])
async def test_registration_requires_both_consents(client, db, extra):
    r = await client.post("/auth/register", json=_registration(**extra))

    assert r.status_code == 400
    assert await db.scalar(select(User).where(User.username == "consenter")) is None


async def test_registration_records_consent(client, db):
    before = datetime.now(UTC)

    r = await client.post(
        "/auth/register", json=_registration(accept_terms=True, pd_consent=True)
    )

    assert r.status_code == 201
    user = await db.scalar(select(User).where(User.username == "consenter"))
    assert user.legal_version == LEGAL_VERSION
    assert user.terms_accepted_at >= before
    assert user.pd_consent_at >= before


# --- Повторное согласие ---------------------------------------------------------

async def test_user_without_consent_is_asked_and_can_accept(client, db):
    user = await make_user(db, username="oldtimer")

    me = await client.get("/auth/me", headers=auth_headers(user))
    assert me.json()["legal_consent_required"] is True

    r = await client.post(
        "/me/legal-consent",
        json={"accept_terms": True, "pd_consent": True},
        headers=auth_headers(user),
    )

    assert r.status_code == 200
    assert r.json()["legal_consent_required"] is False
    await db.refresh(user)
    assert user.legal_version == LEGAL_VERSION
    assert user.pd_consent_at is not None


async def test_outdated_consent_is_asked_again(client, db):
    user = await make_user(db, username="outdated")
    user.terms_accepted_at = user.pd_consent_at = datetime.now(UTC)
    user.legal_version = "2020-01-01"
    await db.commit()

    me = await client.get("/auth/me", headers=auth_headers(user))

    assert me.json()["legal_consent_required"] is True


async def test_legal_consent_rejects_false(client, db):
    user = await make_user(db, username="refuser")

    r = await client.post(
        "/me/legal-consent",
        json={"accept_terms": True, "pd_consent": False},
        headers=auth_headers(user),
    )

    assert r.status_code == 422


# --- Выключатель ИИ-ассистента ---------------------------------------------------

async def test_assistant_enabled_by_default(client, approved_user):
    r = await client.get("/settings", headers=auth_headers(approved_user))

    assert r.status_code == 200
    assert r.json()["assistant_enabled"] is True


async def test_only_admin_can_change_settings(client, approved_user):
    r = await client.patch(
        "/admin/settings", json={"assistant_enabled": False}, headers=auth_headers(approved_user)
    )

    assert r.status_code == 403


async def test_disabled_assistant_does_not_call_the_model(
    client, db, admin_user, approved_user, monkeypatch
):
    from app.api import assistant

    called = []

    async def fake_completion(*args, **kwargs):
        called.append(args)
        return "ответ"

    monkeypatch.setattr(assistant, "chat_completion", fake_completion)

    r = await client.patch(
        "/admin/settings", json={"assistant_enabled": False}, headers=auth_headers(admin_user)
    )
    assert r.status_code == 200
    assert r.json()["assistant_enabled"] is False

    chat = await client.post(
        "/me/assistant/chat",
        json={"messages": [{"role": "user", "content": "Привет"}]},
        headers=auth_headers(approved_user),
    )

    assert chat.status_code == 403
    assert "отключён" in chat.json()["detail"]
    assert called == []
    log = await db.scalar(select(AdminLog).where(AdminLog.action == "assistant_toggle"))
    assert log is not None

    r = await client.patch(
        "/admin/settings", json={"assistant_enabled": True}, headers=auth_headers(admin_user)
    )
    assert r.json()["assistant_enabled"] is True


@pytest.mark.asyncio
async def test_settings_expose_book_size_limits(client, approved_user):
    """Админка проверяет размер книги по тем же числам, что и сервер."""
    from app.core.config import settings

    body = (await client.get("/settings", headers=auth_headers(approved_user))).json()
    assert body["max_pdf_size_mb"] == settings.MAX_PDF_SIZE_MB
    assert body["max_epub_size_mb"] == settings.MAX_EPUB_SIZE_MB
    assert settings.MAX_PDF_SIZE_MB >= 500
