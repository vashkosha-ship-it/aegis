"""Сбор ошибок сервера, воркера и браузеров пользователей.

Отправка идёт по протоколу Sentry (envelope API), который понимают и
Sentry, и self-hosted GlitchTip. Отдельный SDK не подключаем: он приносит
свои зависимости, а нам достаточно одного POST через уже используемый httpx.

Без ERROR_REPORTING_DSN ничего никуда не уходит — ошибки только пишутся в
журнал (journald), как и раньше.

Что отправляется: тип и текст ошибки, стек (имена файлов кода приложения,
функции, строки), путь запроса без параметров, метод, окружение, версия.
Что НЕ отправляется: заголовки, cookie, тело запроса, параметры URL, данные
пользователя. Тексты ошибок обрезаются.
"""
from __future__ import annotations

import asyncio
import json
import logging
import traceback
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlsplit
from uuid import uuid4

import httpx

from app.core.config import settings

logger = logging.getLogger("aegis.errors")

MAX_TEXT = 1000
MAX_FRAMES = 40
SEND_TIMEOUT_SECONDS = 3.0
# Не держим бесконечно отправки, если сервис ошибок недоступен.
MAX_PENDING_SENDS = 20

_pending: set[asyncio.Task] = set()


@dataclass(frozen=True)
class Dsn:
    endpoint: str
    public_key: str


def parse_dsn(dsn: str) -> Dsn | None:
    """https://<key>@<host>/<project_id> → адрес envelope и ключ."""
    if not dsn:
        return None
    parts = urlsplit(dsn.strip())
    project_id = parts.path.strip("/").split("/")[-1] if parts.path else ""
    if parts.scheme not in ("https", "http") or not parts.username or not parts.hostname or not project_id:
        logger.warning("ERROR_REPORTING_DSN задан в неверном формате — отправка отключена")
        return None
    host = parts.hostname + (f":{parts.port}" if parts.port else "")
    prefix = "/".join(parts.path.strip("/").split("/")[:-1])
    base = f"{parts.scheme}://{host}" + (f"/{prefix}" if prefix else "")
    return Dsn(endpoint=f"{base}/api/{project_id}/envelope/", public_key=parts.username)


def _clip(value: object, limit: int = MAX_TEXT) -> str:
    text = str(value or "")
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _path_only(url: str) -> str:
    """Путь без параметров и фрагмента: в них бывают токены и коды."""
    try:
        return urlsplit(url).path or "/"
    except ValueError:
        return "/"


def _frames(exc: BaseException) -> list[dict]:
    frames = []
    for frame in traceback.extract_tb(exc.__traceback__)[-MAX_FRAMES:]:
        filename = frame.filename
        marker = "/app/"
        in_app = marker in filename
        if in_app:
            filename = "app/" + filename.split(marker, 1)[1]
        frames.append({
            "filename": filename,
            "function": frame.name,
            "lineno": frame.lineno,
            "in_app": in_app,
        })
    return frames


def _base_event(platform: str, level: str) -> dict:
    return {
        "event_id": uuid4().hex,
        "timestamp": datetime.now(UTC).isoformat(),
        "platform": platform,
        "level": level,
        "environment": settings.ERROR_REPORTING_ENVIRONMENT,
        "release": settings.ERROR_REPORTING_RELEASE or None,
        "server_name": None,
    }


def exception_event(exc: BaseException, *, method: str = "", path: str = "", source: str = "web") -> dict:
    event = _base_event("python", "error")
    event["exception"] = {
        "values": [{
            "type": type(exc).__name__,
            "value": _clip(exc),
            "stacktrace": {"frames": _frames(exc)},
        }]
    }
    event["tags"] = {"source": source}
    if path:
        event["request"] = {"method": method, "url": _path_only(path)}
        event["transaction"] = f"{method} {_path_only(path)}".strip()
    return event


def client_event(*, message: str, stack: str, url: str, source: str, user_agent: str) -> dict:
    event = _base_event("javascript", "error")
    event["message"] = {"formatted": _clip(message)}
    event["tags"] = {"source": "browser", "kind": _clip(source, 32)}
    event["request"] = {"url": _path_only(url)}
    event["extra"] = {
        "stack": _clip(stack, 4000),
        "user_agent": _clip(user_agent, 200),
    }
    return event


def _envelope(event: dict) -> bytes:
    header = {"event_id": event["event_id"], "sent_at": datetime.now(UTC).isoformat()}
    payload = json.dumps(event, ensure_ascii=False).encode()
    item = {"type": "event", "length": len(payload), "content_type": "application/json"}
    return b"\n".join([json.dumps(header).encode(), json.dumps(item).encode(), payload])


async def _send(dsn: Dsn, event: dict) -> None:
    auth = (
        f"Sentry sentry_version=7, sentry_client=aegis/1.0, sentry_key={dsn.public_key}"
    )
    try:
        async with httpx.AsyncClient(timeout=SEND_TIMEOUT_SECONDS) as client:
            response = await client.post(
                dsn.endpoint,
                content=_envelope(event),
                headers={"Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": auth},
            )
        if response.status_code >= 400:
            logger.warning("Сервис ошибок ответил %s", response.status_code)
    except httpx.HTTPError as exc:
        logger.warning("Не удалось отправить ошибку в сервис ошибок: %s", exc)


def submit(event: dict) -> None:
    """Отправить событие в фоне, не задерживая ответ и не роняя запрос."""
    dsn = parse_dsn(settings.ERROR_REPORTING_DSN)
    if dsn is None:
        return
    if len(_pending) >= MAX_PENDING_SENDS:
        logger.warning("Очередь отправки ошибок переполнена — событие пропущено")
        return
    try:
        task = asyncio.get_running_loop().create_task(_send(dsn, event))
    except RuntimeError:
        return
    _pending.add(task)
    task.add_done_callback(_pending.discard)


def report_exception(exc: BaseException, *, method: str = "", path: str = "", source: str = "web") -> None:
    # Полный стек в журнал и так пишут uvicorn и arq — здесь одна строка,
    # чтобы не дублировать трассировку.
    logger.error(
        "Необработанная ошибка source=%s %s %s: %s",
        source, method, _path_only(path) if path else "", type(exc).__name__,
    )
    submit(exception_event(exc, method=method, path=path, source=source))


def report_client_error(*, message: str, stack: str, url: str, source: str, user_agent: str) -> None:
    logger.warning(
        "Ошибка в браузере kind=%s path=%s: %s",
        _clip(source, 32), _path_only(url), _clip(message, 300),
    )
    submit(client_event(message=message, stack=stack, url=url, source=source, user_agent=user_agent))
