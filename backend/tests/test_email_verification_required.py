"""Подтверждение почты должно проверяться везде, а не только при входе.

Правило «неподтверждённый пользователь не работает с системой» держалось на
договорённости: login отказывает таким, значит токена у них быть не может.
Договорённость нарушалась — сброс пароля выдавал токены, не глядя на
is_verified, и появлялся пользователь, одновременно вошедший в систему и
числящийся неподтверждённым.

Здесь проверяется, что правило выражено в коде: зависимость аутентификации
отклоняет токен неподтверждённого, а сброс пароля подтверждает учётную запись,
потому что код приходит на тот же адрес и доказывает то же самое.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.security import create_access_token, hash_otp
from app.models.user import User
from tests.conftest import auth_headers, make_user


async def _unverified(db, **kwargs) -> User:
    return await make_user(db, is_verified=False, **kwargs)


class TestUnverifiedHasNoAccess:
    async def test_token_of_unverified_user_rejected(self, client, db):
        """Даже с действительным токеном неподтверждённый не проходит."""
        user = await _unverified(db, username="notverified")

        r = await client.get("/auth/me", headers=auth_headers(user))

        assert r.status_code == 403, r.text
        assert "verif" in r.text.lower()

    async def test_verified_user_passes(self, client, db):
        user = await make_user(db, username="verified", is_verified=True)

        r = await client.get("/auth/me", headers=auth_headers(user))

        assert r.status_code == 200

    async def test_unverified_admin_also_rejected(self, client, db):
        """Роль не отменяет подтверждение.

        Иначе достаточно было бы создать администратора в обход обычного пути —
        например, старым сценарием наполнения базы — и правило перестало бы
        действовать для самой опасной учётной записи.
        """
        from app.models.user import UserRole

        admin = await _unverified(db, username="rawadmin", role=UserRole.ADMIN)

        r = await client.get("/auth/me", headers=auth_headers(admin))

        assert r.status_code == 403

    async def test_public_endpoint_treats_unverified_as_guest(self, client, db):
        """Необязательная аутентификация не должна падать — просто не узнаёт."""
        user = await _unverified(db, username="ghost")
        token = create_access_token(
            user.id, user.role.value, token_version=user.token_version
        )

        r = await client.get(
            "/books", headers={"Authorization": f"Bearer {token}"}
        )

        # Список книг закрыт для гостей, но ответ должен быть внятным,
        # а не пятисоткой из-за необработанного состояния.
        assert r.status_code in (200, 401, 403), r.text


class TestPasswordResetVerifies:
    """Сброс пароля доказывает владение ящиком — значит и подтверждает его."""

    async def _request_reset(self, db, user: User, code: str = "123456") -> None:
        user.reset_code = hash_otp(code)
        user.reset_expires = datetime.now(UTC) + timedelta(minutes=30)
        await db.commit()

    async def test_reset_marks_account_verified(self, client, db):
        user = await _unverified(db, username="resetme", email="resetme@example.com")
        user_id = user.id
        await self._request_reset(db, user)

        r = await client.post(
            "/auth/reset-password",
            json={
                "email": "resetme@example.com",
                "code": "123456",
                "new_password": "NewPass123456!",
            },
        )
        assert r.status_code == 200, r.text

        db.expire_all()
        fresh = await db.scalar(select(User).where(User.id == user_id))
        assert fresh.is_verified is True, (
            "код пришёл на тот же адрес, что и код регистрации — учётная "
            "запись должна считаться подтверждённой"
        )

    async def test_tokens_after_reset_actually_work(self, client, db):
        """Раньше здесь выдавался токен, которым нельзя было пользоваться."""
        await _unverified(db, username="resetuse", email="resetuse@example.com")
        user = await db.scalar(select(User).where(User.username == "resetuse"))
        await self._request_reset(db, user)

        r = await client.post(
            "/auth/reset-password",
            json={
                "email": "resetuse@example.com",
                "code": "123456",
                "new_password": "NewPass123456!",
            },
        )
        assert r.status_code == 200
        access = r.json()["access_token"]

        me = await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {access}"}
        )
        assert me.status_code == 200, (
            "токен, выданный при сбросе пароля, не работает — состояние "
            "«вошёл, но не подтверждён» вернулось"
        )

    async def test_reset_clears_pending_verification_code(self, client, db):
        """Старый код подтверждения после этого бесполезен и только мешает."""
        user = await _unverified(db, username="stale", email="stale@example.com")
        user.verify_code = hash_otp("999999")
        user.verify_expires = datetime.now(UTC) + timedelta(minutes=30)
        user_id = user.id
        await self._request_reset(db, user)

        r = await client.post(
            "/auth/reset-password",
            json={
                "email": "stale@example.com",
                "code": "123456",
                "new_password": "NewPass123456!",
            },
        )
        assert r.status_code == 200

        db.expire_all()
        fresh = await db.scalar(select(User).where(User.id == user_id))
        assert fresh.verify_code is None
        assert fresh.verify_expires is None

    async def test_disabled_account_cannot_reset(self, client, db):
        """Отключённая учётная запись не должна воскресать через сброс."""
        user = await make_user(
            db, username="disabled", email="disabled@example.com", is_active=False
        )
        await self._request_reset(db, user)

        r = await client.post(
            "/auth/reset-password",
            json={
                "email": "disabled@example.com",
                "code": "123456",
                "new_password": "NewPass123456!",
            },
        )
        assert r.status_code == 403


class TestLoginStillRefusesUnverified:
    """Прежнее поведение входа не должно измениться."""

    @pytest.mark.parametrize("endpoint", ["/auth/login"])
    async def test_json_login_refused(self, client, db, endpoint):
        await _unverified(db, username="nologin")

        r = await client.post(
            endpoint, json={"username": "nologin", "password": "TestPass123!"}
        )
        assert r.status_code in (401, 403)

    async def test_oauth_form_login_refused(self, client, db):
        await _unverified(db, username="nologinform")

        r = await client.post(
            "/auth/token",
            data={"username": "nologinform", "password": "TestPass123!"},
        )
        assert r.status_code in (401, 403)
