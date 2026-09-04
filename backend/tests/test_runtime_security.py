"""Production startup и глобальный лимит входящего тела."""

import json

import pytest

from app import main


def test_production_rejects_short_secret(monkeypatch):
    monkeypatch.setattr(main.settings, "DEBUG", False)
    monkeypatch.setattr(main.settings, "SECRET_KEY", "too-short")

    with pytest.raises(main.SecurityConfigurationError):
        main.validate_security_configuration()


def test_production_rejects_placeholder_secret(monkeypatch):
    monkeypatch.setattr(main.settings, "DEBUG", False)
    monkeypatch.setattr(
        main.settings,
        "SECRET_KEY",
        "change-me-to-a-long-random-string-min-32-chars",
    )

    with pytest.raises(main.SecurityConfigurationError):
        main.validate_security_configuration()


def test_production_accepts_long_secret(monkeypatch):
    monkeypatch.setattr(main.settings, "DEBUG", False)
    monkeypatch.setattr(main.settings, "SECRET_KEY", "A7$kP9!vQ2@mX8#sL4&zR6^nT1*wB5%y")
    monkeypatch.setattr(main.settings, "ALGORITHM", "HS256")

    main.validate_security_configuration()


async def _call_body_middleware(*, chunks, headers=(), max_bytes=5, path="/"):
    messages = [
        {
            "type": "http.request",
            "body": chunk,
            "more_body": index < len(chunks) - 1,
        }
        for index, chunk in enumerate(chunks)
    ]
    sent = []

    async def receive():
        return messages.pop(0)

    async def send(message):
        sent.append(message)

    async def consume_app(_scope, receive_body, send_response):
        while True:
            message = await receive_body()
            if not message.get("more_body", False):
                break
        await send_response({"type": "http.response.start", "status": 204, "headers": []})
        await send_response({"type": "http.response.body", "body": b""})

    middleware = main.BodySizeLimitMiddleware(consume_app, max_bytes=max_bytes)
    scope = {
        "type": "http",
        "method": "POST",
        "path": path,
        "headers": list(headers),
    }
    await middleware(scope, receive, send)
    return sent


@pytest.mark.asyncio
async def test_stream_limit_rejects_chunked_body_without_content_length():
    sent = await _call_body_middleware(chunks=[b"123", b"456"], max_bytes=5)

    assert sent[0]["status"] == 413


@pytest.mark.asyncio
async def test_invalid_content_length_is_rejected():
    sent = await _call_body_middleware(
        chunks=[b"abc"], headers=[(b"content-length", b"invalid")]
    )

    assert sent[0]["status"] == 400
    payload = json.loads(sent[1]["body"])
    assert payload["detail"] == "Invalid Content-Length"


@pytest.mark.asyncio
async def test_duplicate_content_length_is_rejected():
    sent = await _call_body_middleware(
        chunks=[b"abc"],
        headers=[(b"content-length", b"3"), (b"content-length", b"4")],
    )

    assert sent[0]["status"] == 400


@pytest.mark.asyncio
async def test_body_within_limit_reaches_application():
    sent = await _call_body_middleware(chunks=[b"12", b"345"], max_bytes=5)

    assert sent[0]["status"] == 204


def test_only_upload_routes_receive_large_limits():
    middleware = main.BodySizeLimitMiddleware(lambda *_args: None)

    assert (
        middleware._limit_for_scope({"path": "/api/auth/login"})
        == 2 * 1024 * 1024
    )
    assert (
        middleware._limit_for_scope({"path": "/api/books/42/pdf"})
        > 100 * 1024 * 1024
    )
    assert (
        middleware._limit_for_scope({"path": "/api/books/42/cover"})
        < 10 * 1024 * 1024
    )
    assert (
        middleware._limit_for_scope({"path": "/api/me/avatar"})
        == 3 * 1024 * 1024
    )
