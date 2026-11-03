"""Клиент GigaChat API (Сбер).

Доступ двухступенчатый: ключом авторизации из личного кабинета получаем
токен доступа (живёт 30 минут), с токеном — запросы к модели. Токен держим
в памяти процесса и обновляем заранее; на 401 обновляем и повторяем один раз.
Протокол ответа совместим с OpenAI: choices[0].message / choices[0].delta.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator

import httpx

from app.core.config import settings
from app.services.ai_errors import AIProviderError

logger = logging.getLogger(__name__)

# Обновляем токен за минуту до истечения: запрос может идти долго.
_TOKEN_MARGIN_SECONDS = 60

_token: str | None = None
_token_expires_at: float = 0.0
_token_lock = asyncio.Lock()


def is_configured() -> bool:
    return bool(settings.GIGACHAT_AUTH_KEY.strip())


def _verify() -> str | bool:
    return settings.GIGACHAT_CA_BUNDLE.strip() or True


def _reset_token() -> None:
    global _token, _token_expires_at
    _token = None
    _token_expires_at = 0.0


async def _get_token(*, force: bool = False) -> str:
    global _token, _token_expires_at
    if not is_configured():
        raise AIProviderError("Ключ GigaChat не задан на сервере")
    async with _token_lock:
        if not force and _token and time.time() < _token_expires_at - _TOKEN_MARGIN_SECONDS:
            return _token
        headers = {
            "Authorization": f"Basic {settings.GIGACHAT_AUTH_KEY.strip()}",
            "RqUID": str(uuid.uuid4()),
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=30.0, verify=_verify()) as client:
                resp = await client.post(
                    settings.GIGACHAT_OAUTH_URL,
                    headers=headers,
                    data={"scope": settings.GIGACHAT_SCOPE},
                )
        except httpx.HTTPError as e:
            logger.exception("GigaChat OAuth network error")
            raise AIProviderError(f"Сетевая ошибка при получении токена GigaChat: {e}") from e
        if resp.status_code in (400, 401, 403):
            logger.error("GigaChat OAuth %s: %s", resp.status_code, resp.text[:300])
            raise AIProviderError(
                f"GigaChat отклонил ключ авторизации ({resp.status_code}): проверьте ключ и scope"
            )
        if resp.status_code >= 400:
            logger.error("GigaChat OAuth %s: %s", resp.status_code, resp.text[:300])
            raise AIProviderError(f"GigaChat не выдал токен (ошибка {resp.status_code})")
        try:
            data = resp.json()
            token = data["access_token"]
            # expires_at приходит в миллисекундах; на всякий случай понимаем и секунды.
            expires = float(data.get("expires_at") or 0)
            if expires > 1e12:
                expires /= 1000
            _token = token
            _token_expires_at = expires or (time.time() + 30 * 60)
            return token
        except (KeyError, ValueError, TypeError) as e:
            raise AIProviderError("Неожиданный ответ GigaChat при получении токена") from e


def _payload(messages: list[dict], max_tokens: int, stream: bool) -> dict:
    return {
        "model": settings.GIGACHAT_MODEL,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": max_tokens,
        "stream": stream,
    }


def _raise_for_status(status: int, body: str) -> None:
    if status == 429:
        raise AIProviderError("GigaChat: превышен лимит запросов (429)")
    if status == 402:
        raise AIProviderError("GigaChat: закончились токены на счёте (402)")
    if status >= 400:
        logger.error("GigaChat error %s: %s", status, body[:500])
        raise AIProviderError(f"GigaChat вернул ошибку {status}")


async def chat_completion(messages: list[dict], *, max_tokens: int, timeout: float) -> str:
    """messages — уже с системным сообщением в начале."""
    url = f"{settings.GIGACHAT_BASE_URL.rstrip('/')}/chat/completions"
    for attempt in (1, 2):
        token = await _get_token(force=attempt == 2)
        try:
            async with httpx.AsyncClient(timeout=timeout, verify=_verify()) as client:
                resp = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                    json=_payload(messages, max_tokens, False),
                )
        except httpx.HTTPError as e:
            logger.exception("GigaChat network error")
            raise AIProviderError(f"Сетевая ошибка при обращении к GigaChat: {e}") from e
        if resp.status_code == 401 and attempt == 1:
            _reset_token()
            continue
        _raise_for_status(resp.status_code, resp.text)
        try:
            return resp.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as e:
            raise AIProviderError("Неожиданный формат ответа GigaChat") from e
    raise AIProviderError("GigaChat не принял токен доступа (401)")


async def chat_completion_stream(messages: list[dict], *, max_tokens: int) -> AsyncIterator[str]:
    url = f"{settings.GIGACHAT_BASE_URL.rstrip('/')}/chat/completions"
    for attempt in (1, 2):
        token = await _get_token(force=attempt == 2)
        try:
            async with httpx.AsyncClient(timeout=120.0, verify=_verify()) as client:
                async with client.stream(
                    "POST",
                    url,
                    headers={"Authorization": f"Bearer {token}", "Accept": "text/event-stream"},
                    json=_payload(messages, max_tokens, True),
                ) as resp:
                    if resp.status_code == 401 and attempt == 1:
                        _reset_token()
                        continue
                    if resp.status_code >= 400:
                        body = (await resp.aread()).decode("utf-8", "replace")
                        _raise_for_status(resp.status_code, body)
                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        data = line[len("data:"):].strip()
                        if data == "[DONE]":
                            return
                        try:
                            piece = json.loads(data)["choices"][0].get("delta", {}).get("content")
                        except (KeyError, IndexError, ValueError):
                            continue
                        if piece:
                            yield piece
                    return
        except httpx.HTTPError as e:
            logger.exception("GigaChat stream network error")
            raise AIProviderError(f"Сетевая ошибка при обращении к GigaChat: {e}") from e
    raise AIProviderError("GigaChat не принял токен доступа (401)")
