"""Refresh-токен не должен попадать в тело ответа. Никогда.

Раньше его можно было получить, просто добавив к запросу заголовок
X-Client-Type: mobile — он задумывался как признак мобильной обёртки, но
выставить его может кто угодно, включая обычный fetch со страницы. То есть
переезд refresh-токена в httpOnly-cookie обходился одной строкой.

Здесь проверяется, что такой лазейки нет ни на одном эндпоинте, выдающем
токены, и что подделка заголовка ничего не меняет.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models.user import User
from tests.conftest import make_user

# Заголовки, которыми пытались бы притвориться «мобильным клиентом»
FAKE_CLIENT_HEADERS = [
    {"X-Client-Type": "mobile"},
    {"X-Client-Type": "Mobile"},
    {"X-Client-Type": "MOBILE"},
    {"x-client-type": "mobile"},
    {"X-Client-Type": "mobile", "User-Agent": "okhttp/4.9.0"},
]


def _assert_no_refresh_in_body(response, where: str) -> None:
    """Ни в каком виде: ни поля, ни строки токена в теле."""
    assert response.status_code == 200, f"{where}: {response.text}"
    body = response.json()
    assert "refresh_token" not in body, f"{where}: refresh-токен в теле ответа"
    assert set(body) <= {"access_token", "token_type"}, (
        f"{where}: в ответе лишние поля — {sorted(body)}"
    )


class TestNoRefreshInBody:
    async def test_login_never_returns_refresh(self, client, db):
        await make_user(db, username="bodycheck")
        r = await client.post(
            "/auth/login", json={"username": "bodycheck", "password": "TestPass123!"}
        )
        _assert_no_refresh_in_body(r, "login")
        # При этом cookie выставлена — сеанс работает
        assert client.cookies.get("aegis_refresh"), "refresh-cookie не установлена"

    @pytest.mark.parametrize("headers", FAKE_CLIENT_HEADERS)
    async def test_login_ignores_forged_client_header(self, client, db, headers):
        await make_user(db, username="forger")
        r = await client.post(
            "/auth/login",
            json={"username": "forger", "password": "TestPass123!"},
            headers=headers,
        )
        _assert_no_refresh_in_body(r, f"login {headers}")

    @pytest.mark.parametrize("headers", FAKE_CLIENT_HEADERS)
    async def test_refresh_ignores_forged_client_header(self, client, db, headers):
        await make_user(db, username="forger2")
        await client.post(
            "/auth/login", json={"username": "forger2", "password": "TestPass123!"}
        )
        csrf = client.cookies.get("aegis_csrf")
        r = await client.post(
            "/auth/refresh", json=None, headers={**headers, "X-CSRF-Token": csrf}
        )
        _assert_no_refresh_in_body(r, f"refresh {headers}")

    async def test_oauth_token_endpoint_never_returns_refresh(self, client, db):
        """Swagger-совместимый /auth/token — тот же контракт."""
        await make_user(db, username="oauthuser")
        r = await client.post(
            "/auth/token",
            data={"username": "oauthuser", "password": "TestPass123!"},
            headers={"X-Client-Type": "mobile"},
        )
        _assert_no_refresh_in_body(r, "token")

    async def test_no_schema_promises_refresh_token(self):
        """Ни одна схема ответа не должна объявлять refresh_token.

        Проверки выше бьют по конкретным вызовам. Эта — по контракту целиком:
        если завтра появится ещё один эндпоинт, выдающий пару, он попадётся
        здесь, даже если отдельного теста для него никто не напишет.

        Смотрим в OpenAPI-схему, а не в app.routes. Устройство app.routes
        меняется между версиями FastAPI, и прежняя редакция этой проверки
        какое-то время обходила семь маршрутов вместо восьмидесяти —
        проходила, ничего при этом не проверяя.
        """
        from app.main import app as fastapi_app
        from app.schemas import auth as auth_schemas

        assert not hasattr(auth_schemas, "TokenPair"), (
            "схема TokenPair снова объявлена — она отдаёт refresh наружу"
        )
        assert "refresh_token" not in auth_schemas.AccessTokenOnly.model_fields

        schema = fastapi_app.openapi()
        schemas = schema.get("components", {}).get("schemas", {})
        paths = schema.get("paths", {})

        assert len(paths) > 50, (
            f"в схеме всего {len(paths)} путей — проверка смотрит не туда"
        )

        # Собираем схемы ответов отдельно, чтобы сообщение при регрессии точно
        # указывало публичный контракт, из которого произошла утечка.
        used_in_responses: set[str] = set()
        for methods in paths.values():
            for operation in methods.values():
                if not isinstance(operation, dict):
                    continue
                for response in operation.get("responses", {}).values():
                    for media in response.get("content", {}).values():
                        ref = media.get("schema", {}).get("$ref", "")
                        if ref.startswith("#/components/schemas/"):
                            used_in_responses.add(ref.rsplit("/", 1)[-1])

        offenders = [
            name for name in sorted(used_in_responses)
            if "refresh_token" in schemas.get(name, {}).get("properties", {})
        ]
        assert not offenders, (
            f"схемы ответа объявляют refresh_token: {offenders}"
        )
        assert "refresh_token" not in str(schemas), (
            "refresh_token снова появился в публичной OpenAPI-схеме"
        )

    async def test_refresh_token_absent_from_whole_schema(self):
        """Грубая, но полезная проверка: слова быть не должно нигде в ответах.

        Ловит случай, когда токен возвращают не через схему, а вручную
        собранным словарём с описанием в docstring.
        """
        from app.main import app as fastapi_app

        schema = fastapi_app.openapi()
        for path, methods in schema.get("paths", {}).items():
            for method, operation in methods.items():
                if not isinstance(operation, dict):
                    continue
                responses = operation.get("responses", {})
                assert "refresh_token" not in str(responses), (
                    f"{method.upper()} {path} упоминает refresh_token в ответе"
                )


class TestLogoutHonesty:
    async def test_logout_revokes_and_clears(self, client, db):
        await make_user(db, username="quitter2")
        await client.post(
            "/auth/login", json={"username": "quitter2", "password": "TestPass123!"}
        )
        csrf = client.cookies.get("aegis_csrf")

        r = await client.post("/auth/logout", headers={"X-CSRF-Token": csrf})
        assert r.status_code == 204
        assert not client.cookies.get("aegis_refresh")

    async def test_logout_reports_failure_instead_of_lying(
        self, client, db, monkeypatch
    ):
        """Если отозвать токен не удалось, выход не должен возвращать успех.

        Прежде здесь стоял голый except: pass — пользователь видел «вы вышли»,
        а refresh-токен оставался рабочим до конца срока. Для того, кто выходит
        именно потому, что устройство потеряно, это худший из возможных ответов.
        """
        await make_user(db, username="failout")
        await client.post(
            "/auth/login", json={"username": "failout", "password": "TestPass123!"}
        )
        csrf = client.cookies.get("aegis_csrf")

        from app.services import tokens as tokens_service

        async def _boom(*args, **kwargs):
            raise RuntimeError("база недоступна")

        monkeypatch.setattr(tokens_service, "revoke_refresh_token", _boom)

        r = await client.post("/auth/logout", headers={"X-CSRF-Token": csrf})
        assert r.status_code == 503, r.text
        # Cookie не стёрта: сеанс действительно не завершён
        assert client.cookies.get("aegis_refresh")


class TestUserStillWorks:
    async def test_full_cycle_after_changes(self, client, db):
        """Вход, обновление, выход — цикл целиком, без токена в теле."""
        user = await make_user(db, username="cycler")

        login = await client.post(
            "/auth/login", json={"username": "cycler", "password": "TestPass123!"}
        )
        _assert_no_refresh_in_body(login, "login")
        access = login.json()["access_token"]

        me = await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {access}"}
        )
        assert me.status_code == 200
        assert me.json()["username"] == "cycler"

        csrf = client.cookies.get("aegis_csrf")
        refreshed = await client.post(
            "/auth/refresh", json=None, headers={"X-CSRF-Token": csrf}
        )
        _assert_no_refresh_in_body(refreshed, "refresh")

        csrf = client.cookies.get("aegis_csrf")
        out = await client.post("/auth/logout", headers={"X-CSRF-Token": csrf})
        assert out.status_code == 204

        # После выхода обновиться нельзя
        again = await client.post("/auth/refresh", json=None)
        assert again.status_code in (401, 403)

        assert await db.scalar(select(User).where(User.id == user.id)) is not None
