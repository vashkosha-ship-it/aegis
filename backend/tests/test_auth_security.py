"""Тесты на дыры в аутентификации, которые чинились вручную.

Каждый тест здесь соответствует конкретной исправленной уязвимости —
если рефакторинг вернёт её, тест упадёт.
"""
from __future__ import annotations

import pytest

from app.core.security import create_access_token, hash_otp
from tests.conftest import auth_headers, make_user


class TestApprovalGate:
    """Неодобренный админом аккаунт не должен видеть контент библиотеки."""

    async def test_pending_user_cannot_read_books(self, client, pending_user):
        r = await client.get("/books", headers=auth_headers(pending_user))
        assert r.status_code == 403
        assert "approval" in (r.json().get("detail") or "").lower()

    async def test_pending_user_can_read_own_profile(self, client, pending_user):
        """Экран ожидания должен уметь проверить свой статус."""
        r = await client.get("/auth/me", headers=auth_headers(pending_user))
        assert r.status_code == 200
        assert r.json()["username"] == "pending"

    async def test_pending_user_can_take_onboarding(self, client, pending_user):
        """Тест уровня разрешён до одобрения — так задумано в UI."""
        r = await client.get("/me/onboarding", headers=auth_headers(pending_user))
        assert r.status_code == 200

    async def test_approved_user_can_read_books(self, client, approved_user):
        r = await client.get("/books", headers=auth_headers(approved_user))
        assert r.status_code == 200

    async def test_admin_bypasses_approval(self, client, db):
        from app.models.user import UserRole

        admin = await make_user(
            db, username="adm2", role=UserRole.ADMIN, is_approved=False
        )
        r = await client.get("/books", headers=auth_headers(admin))
        assert r.status_code == 200


class TestEmailVerification:
    """Обход подтверждения email через OAuth2-эндпоинт /auth/token."""

    async def test_unverified_cannot_login_via_json(self, client, db):
        await make_user(db, username="unver", is_verified=False)
        r = await client.post(
            "/auth/login", json={"username": "unver", "password": "TestPass123!"}
        )
        assert r.status_code == 403

    async def test_unverified_cannot_login_via_oauth_form(self, client, db):
        """Раньше /auth/token не проверял is_verified и выдавал токены."""
        await make_user(db, username="unver2", is_verified=False)
        r = await client.post(
            "/auth/token",
            data={"username": "unver2", "password": "TestPass123!"},
        )
        assert r.status_code == 403, "OAuth2-форма не должна пускать неподтверждённых"

    async def test_verified_can_login_via_oauth_form(self, client, db):
        await make_user(db, username="ver2")
        r = await client.post(
            "/auth/token",
            data={"username": "ver2", "password": "TestPass123!"},
        )
        assert r.status_code == 200
        assert "access_token" in r.json()


class TestTokenRevocation:
    """token_version: смена пароля отзывает все выданные токены."""

    async def test_old_token_rejected_after_password_change(
        self, client, db, approved_user
    ):
        headers = auth_headers(approved_user)
        assert (await client.get("/auth/me", headers=headers)).status_code == 200

        r = await client.post(
            "/me/password",
            headers=headers,
            json={"current_password": "TestPass123!", "new_password": "NewPass456!"},
        )
        assert r.status_code in (200, 204)

        # Тот же токен больше не действует
        r = await client.get("/auth/me", headers=headers)
        assert r.status_code == 401

    async def test_forged_token_version_rejected(self, client, approved_user):
        """Подделать tv нельзя — он внутри подписанного JWT, но проверим сверку."""
        token = create_access_token(
            approved_user.id, approved_user.role.value, token_version=999
        )
        r = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401


class TestOtpSecurity:
    """Коды подтверждения: хранение и перебор."""

    async def test_verify_code_stored_hashed(self, client, db):
        """В БД не должно быть кода в открытом виде."""
        r = await client.post(
            "/auth/register",
            json={
                "username": "newbie",
                "password": "TestPass123!",
                "email": "newbie@example.com",
            },
        )
        assert r.status_code == 201

        from sqlalchemy import select

        from app.models.user import User

        user = await db.scalar(select(User).where(User.username == "newbie"))
        assert user is not None
        assert user.verify_code is not None
        # HMAC-hex — 64 символа, а не 6-значный код
        assert len(user.verify_code) == 64
        assert not user.verify_code.isdigit()

    async def test_otp_bruteforce_is_rate_limited(self, client, db):
        """6-значный код перебирается за минуты — должен стоять лимит попыток."""
        user = await make_user(db, username="otpuser", is_verified=False)
        user.verify_code = hash_otp("123456")
        from tests.conftest import in_minutes

        user.verify_expires = in_minutes(30)
        await db.commit()

        statuses = []
        for i in range(8):
            r = await client.post(
                "/auth/verify",
                json={"email": user.email, "code": f"00000{i}"},
            )
            statuses.append(r.status_code)

        assert 429 in statuses, f"Нет rate limit на ввод кода: {statuses}"

    async def test_email_send_is_rate_limited(self, client, db):
        """Иначе чужой ящик можно завалить письмами."""
        user = await make_user(db, username="spamtarget", is_verified=False)
        statuses = []
        for _ in range(6):
            r = await client.post("/auth/resend-code", json={"email": user.email})
            statuses.append(r.status_code)
        assert 429 in statuses, f"Нет лимита на отправку писем: {statuses}"


class TestPasswordReset:
    """Сброс пароля не должен быть обходным путём для входа."""

    async def test_disabled_account_cannot_reset(self, client, db):
        user = await make_user(db, username="disabled", is_active=False)
        user.reset_code = hash_otp("111111")
        from tests.conftest import in_minutes

        user.reset_expires = in_minutes(30)
        await db.commit()

        r = await client.post(
            "/auth/reset-password",
            json={
                "email": user.email,
                "code": "111111",
                "new_password": "Whatever123!",
            },
        )
        assert r.status_code == 403
