"""Тесты: refresh-токен не должен утекать в тело ответа браузеру.

Смысл переезда на httpOnly-cookie именно в том, что JavaScript не видит
refresh-токен. Если продублировать его в JSON, защита обнуляется: скрипт,
внедрённый через XSS, читает токен прямо из ответа, не трогая cookie.
"""
from __future__ import annotations

from sqlalchemy import select

from app.models.refresh_token import RefreshToken
from tests.conftest import make_user

MOBILE = {"X-Client-Type": "mobile"}


class TestBrowserResponses:
    async def test_login_does_not_return_refresh(self, client, db):
        await make_user(db, username="leaktest")

        r = await client.post(
            "/auth/login", json={"username": "leaktest", "password": "TestPass123!"}
        )
        assert r.status_code == 200

        body = r.json()
        assert "access_token" in body
        assert "refresh_token" not in body, "refresh-токен не должен быть в теле"
        assert "refresh" not in r.text.lower().replace("refresh_token", "")

    async def test_refresh_does_not_return_refresh(self, client, db):
        await make_user(db, username="leaktest2")
        await client.post(
            "/auth/login", json={"username": "leaktest2", "password": "TestPass123!"}
        )

        csrf = client.cookies.get("aegis_csrf")
        r = await client.post(
            "/auth/refresh", json=None, headers={"X-CSRF-Token": csrf}
        )
        assert r.status_code == 200
        assert "refresh_token" not in r.json()

    async def test_cookie_is_set_anyway(self, client, db):
        """Токен не в теле — значит он должен быть в cookie."""
        await make_user(db, username="leaktest3")

        await client.post(
            "/auth/login", json={"username": "leaktest3", "password": "TestPass123!"}
        )
        assert client.cookies.get("aegis_refresh"), "cookie с refresh не выставлена"


class TestMobileResponses:
    async def test_mobile_client_gets_pair(self, client, db):
        """У мобильной обёртки нет cookie-хранилища — ей пара нужна в теле."""
        await make_user(db, username="mobileuser")

        r = await client.post(
            "/auth/login",
            json={"username": "mobileuser", "password": "TestPass123!"},
            headers=MOBILE,
        )
        assert r.status_code == 200

        body = r.json()
        assert "access_token" in body
        assert "refresh_token" in body

    async def test_header_must_be_explicit(self, client, db):
        """Без заголовка — браузерный ответ. Умолчание безопасное."""
        await make_user(db, username="mobileuser2")

        r = await client.post(
            "/auth/login",
            json={"username": "mobileuser2", "password": "TestPass123!"},
            headers={"X-Client-Type": "desktop"},
        )
        assert "refresh_token" not in r.json()


class TestLogoutRevocation:
    async def test_logout_revokes_token(self, client, db):
        """Удалить cookie мало: значение остаётся валидным до истечения срока."""
        await make_user(db, username="quitter2")
        await client.post(
            "/auth/login", json={"username": "quitter2", "password": "TestPass123!"}
        )

        csrf = client.cookies.get("aegis_csrf")
        r = await client.post("/auth/logout", headers={"X-CSRF-Token": csrf})
        assert r.status_code == 204

        record = await db.scalar(select(RefreshToken))
        await db.refresh(record)
        assert record.used_at is not None, "токен должен быть отозван при выходе"

    async def test_logout_requires_csrf(self, client, db):
        """Выход меняет состояние — чужой сайт не должен его инициировать."""
        await make_user(db, username="quitter3")
        await client.post(
            "/auth/login", json={"username": "quitter3", "password": "TestPass123!"}
        )

        r = await client.post("/auth/logout")
        assert r.status_code == 403
