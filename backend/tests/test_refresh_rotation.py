"""Тесты ротации refresh-токенов.

Проверяют то, что чинилось вручную: одноразовость, детект утечки, отказ от
неотслеживаемых токенов старого формата.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.security import create_refresh_token
from app.models.refresh_token import RefreshToken
from tests.conftest import make_user


async def _login(client, username="refresher", password="TestPass123!"):
    r = await client.post("/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


async def _refresh(client, token: str | None = None):
    """Обновить пару так же, как это делает браузер.

    Клиент httpx хранит cookie между запросами, поэтому refresh-cookie уходит
    автоматически — и сервер требует CSRF-заголовок. Дублируем значение из
    cookie, как и настоящий фронт.
    """
    csrf = client.cookies.get("aegis_csrf")
    headers = {"X-CSRF-Token": csrf} if csrf else {}
    body = {"refresh_token": token} if token else None
    return await client.post("/auth/refresh", json=body, headers=headers)


class TestRefreshRotation:
    async def test_refresh_returns_new_pair(self, client, db):
        await make_user(db, username="refresher")
        tokens = await _login(client)
        assert "refresh_token" not in tokens, "браузер не должен получать refresh в теле"
        old_refresh = client.cookies.get("aegis_refresh")

        r = await _refresh(client)
        assert r.status_code == 200, r.text
        new_refresh = client.cookies.get("aegis_refresh")
        assert new_refresh != old_refresh, "токен должен меняться"

    async def test_old_token_marked_used(self, client, db):
        await make_user(db, username="refresher")
        await _login(client)

        await _refresh(client)

        used = await db.scalar(
            select(RefreshToken).where(RefreshToken.used_at.isnot(None))
        )
        assert used is not None, "потраченный токен должен быть помечен"
        assert used.replaced_by, "должна быть ссылка на выданный взамен"


class TestRefreshReuse:
    async def test_reuse_outside_grace_revokes_sessions(self, client, db):
        """Предъявление потраченного токена = утечка → все сессии отзываются."""
        user = await make_user(db, username="refresher")
        await _login(client)
        old_refresh = client.cookies.get("aegis_refresh")

        r1 = await _refresh(client)
        assert r1.status_code == 200, r1.text
        new_refresh = client.cookies.get("aegis_refresh")

        # Сдвигаем время использования в прошлое, за пределы окна благодати
        record = await db.scalar(select(RefreshToken).where(RefreshToken.used_at.isnot(None)))
        record.used_at = datetime.now(UTC) - timedelta(minutes=5)
        await db.commit()

        # Чистим cookie: иначе сервер возьмёт из неё СВЕЖИЙ токен (cookie
        # приоритетнее тела), и повторного использования не получится.
        client.cookies.clear()

        version_before = user.token_version
        r2 = await client.post(
            "/auth/refresh", json={"refresh_token": old_refresh}
        )
        assert r2.status_code == 401, r2.text

        await db.refresh(user)
        assert user.token_version > version_before, "сессии должны быть отозваны"

        # Пара, выданная в r1, тоже больше не работает
        client.cookies.clear()
        r3 = await client.post(
            "/auth/refresh", json={"refresh_token": new_refresh}
        )
        assert r3.status_code == 401


class TestLegacyTokens:
    async def test_token_without_jti_rejected(self, client, db):
        """Старый формат нельзя отследить — принимать его небезопасно."""
        user = await make_user(db, username="oldclient")
        legacy = create_refresh_token(user.id, token_version=user.token_version)

        r = await _refresh(client, legacy)
        assert r.status_code == 401

    async def test_forged_jti_rejected(self, client, db):
        """jti, которого нет в БД, не должен подходить."""
        user = await make_user(db, username="forger")
        forged = create_refresh_token(
            user.id, token_version=user.token_version, jti="i-made-this-up"
        )

        r = await _refresh(client, forged)
        assert r.status_code == 401


class TestCsrfProtection:
    """Cookie браузер отправляет сам — значит нужен второй фактор."""

    async def test_refresh_without_csrf_header_rejected(self, client, db):
        await make_user(db, username="csrfuser")
        await _login(client, "csrfuser")

        # Cookie уйдёт автоматически, а заголовок не ставим
        r = await client.post("/auth/refresh", json=None)
        assert r.status_code == 403

    async def test_refresh_with_wrong_csrf_rejected(self, client, db):
        await make_user(db, username="csrfuser2")
        await _login(client, "csrfuser2")

        r = await client.post(
            "/auth/refresh", json=None, headers={"X-CSRF-Token": "wrong-value"}
        )
        assert r.status_code == 403

    async def test_logout_clears_cookie(self, client, db):
        await make_user(db, username="quitter")
        await _login(client, "quitter")
        assert client.cookies.get("aegis_refresh")

        csrf = client.cookies.get("aegis_csrf")
        r = await client.post("/auth/logout", headers={"X-CSRF-Token": csrf})
        assert r.status_code == 204
        assert not client.cookies.get("aegis_refresh")
