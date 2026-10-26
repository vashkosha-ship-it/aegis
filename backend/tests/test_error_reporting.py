"""Сбор ошибок: формат событий, приём из браузера, необработанные ошибки."""
from __future__ import annotations

import pytest

from app.core.config import settings
from app.main import app
from app.services import error_reporting

DSN = "https://publickey@errors.example.com/42"


@pytest.fixture
def captured(monkeypatch):
    """Перехватить отправку: событие не уходит в сеть, а попадает в список."""
    events = []
    monkeypatch.setattr(settings, "ERROR_REPORTING_DSN", DSN)
    monkeypatch.setattr(error_reporting, "submit", events.append)
    return events


# --- DSN -----------------------------------------------------------------------

def test_parse_dsn():
    dsn = error_reporting.parse_dsn(DSN)
    assert dsn.endpoint == "https://errors.example.com/api/42/envelope/"
    assert dsn.public_key == "publickey"


def test_parse_dsn_with_path_prefix_and_port():
    dsn = error_reporting.parse_dsn("https://k@glitchtip.local:8443/sub/7")
    assert dsn.endpoint == "https://glitchtip.local:8443/sub/api/7/envelope/"


@pytest.mark.parametrize("value", ["", "not a dsn", "https://errors.example.com/42", "ftp://k@h/1"])
def test_invalid_dsn_disables_sending(value):
    assert error_reporting.parse_dsn(value) is None


def test_submit_without_dsn_sends_nothing(monkeypatch):
    monkeypatch.setattr(settings, "ERROR_REPORTING_DSN", "")
    sent = []
    monkeypatch.setattr(error_reporting, "_send", lambda *a: sent.append(a))
    error_reporting.submit({"event_id": "x"})
    assert sent == []


# --- События -------------------------------------------------------------------

def test_exception_event_has_no_query_string():
    try:
        raise ValueError("сломалось")
    except ValueError as exc:
        event = error_reporting.exception_event(exc, method="GET", path="/api/books?token=secret")

    assert event["exception"]["values"][0]["type"] == "ValueError"
    assert event["request"] == {"method": "GET", "url": "/api/books"}
    assert "secret" not in str(event)
    assert event["exception"]["values"][0]["stacktrace"]["frames"]


def test_client_event_clips_and_strips_url():
    event = error_reporting.client_event(
        message="x" * 5000, stack="s", url="/reader?code=123456#page", source="error", user_agent="UA"
    )
    assert len(event["message"]["formatted"]) == error_reporting.MAX_TEXT
    assert event["request"] == {"url": "/reader"}
    assert "123456" not in str(event)


# --- Приём из браузера ----------------------------------------------------------

async def test_client_error_is_accepted_without_login(client, captured):
    r = await client.post(
        "/client-errors",
        json={"kind": "error", "message": "TypeError: x is undefined", "stack": "at a.js:1", "url": "/?q=1"},
    )

    assert r.status_code == 204
    assert len(captured) == 1
    assert captured[0]["platform"] == "javascript"
    assert captured[0]["request"] == {"url": "/"}


async def test_client_errors_are_rate_limited(client, captured):
    for i in range(35):
        await client.post("/client-errors", json={"message": f"ошибка {i}"})

    assert len(captured) == 30


async def test_empty_client_error_is_ignored(client, captured):
    r = await client.post("/client-errors", json={"kind": "error"})

    assert r.status_code == 204
    assert captured == []


async def test_client_error_rejects_oversized_payload(client, captured):
    r = await client.post("/client-errors", json={"message": "x" * 3000})

    assert r.status_code == 422
    assert captured == []


# --- Необработанные ошибки сервера ------------------------------------------------

async def test_unhandled_exception_is_reported(client, captured):
    async def boom():
        raise RuntimeError("неожиданная ошибка")

    app.router.add_api_route("/api/__test_boom", boom, methods=["GET"])
    try:
        # ASGI-транспорт тестов пробрасывает исключение приложения дальше —
        # ответ 500 к этому моменту уже отправлен обработчиком.
        with pytest.raises(RuntimeError):
            await client.get("/__test_boom?secret=1")
    finally:
        app.router.routes[:] = [
            route for route in app.router.routes if getattr(route, "path", "") != "/api/__test_boom"
        ]

    assert len(captured) == 1
    event = captured[0]
    assert event["exception"]["values"][0]["type"] == "RuntimeError"
    assert event["request"] == {"method": "GET", "url": "/api/__test_boom"}
    assert event["tags"]["source"] == "web"
