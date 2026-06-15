"""Тонкий клиент для DeepSeek API (OpenAI-совместимый протокол)."""
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class DeepSeekError(Exception):
    """Ошибка вызова DeepSeek API."""


# Системный промпт — задаёт «характер» ассистента
DEFAULT_SYSTEM_PROMPT = (
    "Ты — Aegis Assistant, дружелюбный AI-ассистент для специалистов "
    "по информационной безопасности. Помогаешь учиться: объясняешь концепции, "
    "разбираешь атаки и защиту, советуешь литературу. Отвечай на русском, "
    "по делу, без воды. Если вопрос вне темы кибербезопасности и обучения — "
    "вежливо переключи разговор обратно. Не давай советов как совершать "
    "противоправные действия, даже в учебных целях — только защитная сторона."
)


async def chat_completion(messages: list[dict], *, system_prompt: str | None = None) -> str:
    """Отправить диалог в DeepSeek, вернуть текст ответа.

    messages: [{"role": "user"|"assistant", "content": "..."}]
    """
    if not settings.DEEPSEEK_API_KEY:
        raise DeepSeekError("DeepSeek API key is not configured on the server")

    payload_messages = [
        {"role": "system", "content": system_prompt or DEFAULT_SYSTEM_PROMPT},
        *messages,
    ]

    headers = {
        "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.DEEPSEEK_MODEL,
        "messages": payload_messages,
        "temperature": 0.7,
        "max_tokens": 1024,
        "stream": False,
    }

    url = f"{settings.DEEPSEEK_BASE_URL}/chat/completions"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
    except httpx.HTTPError as e:
        logger.exception("DeepSeek network error")
        raise DeepSeekError(f"Сетевая ошибка при обращении к DeepSeek: {e}") from e

    if resp.status_code == 401:
        raise DeepSeekError("DeepSeek API key invalid (401)")
    if resp.status_code == 429:
        raise DeepSeekError("DeepSeek rate limit exceeded (429)")
    if resp.status_code >= 400:
        logger.error("DeepSeek error %s: %s", resp.status_code, resp.text[:500])
        raise DeepSeekError(f"DeepSeek вернул ошибку {resp.status_code}")

    try:
        data = resp.json()
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as e:
        raise DeepSeekError("Неожиданный формат ответа DeepSeek") from e

async def chat_completion_stream(
    messages: list[dict], *, system_prompt: str | None = None
):
    """Стримить ответ DeepSeek по кускам (async-генератор строк-дельт).

    Отдаёт текстовые фрагменты по мере генерации. OpenAI-совместимый SSE:
    каждая строка вида `data: {json}`, последняя — `data: [DONE]`.
    Бросает DeepSeekError при сетевых/HTTP-ошибках.
    """
    import json as _json

    if not settings.DEEPSEEK_API_KEY:
        raise DeepSeekError("DeepSeek API key is not configured on the server")

    payload_messages = [
        {"role": "system", "content": system_prompt or DEFAULT_SYSTEM_PROMPT},
        *messages,
    ]
    headers = {
        "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.DEEPSEEK_MODEL,
        "messages": payload_messages,
        "temperature": 0.7,
        "max_tokens": 1024,
        "stream": True,
    }
    url = f"{settings.DEEPSEEK_BASE_URL}/chat/completions"

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                if resp.status_code == 401:
                    raise DeepSeekError("DeepSeek API key invalid (401)")
                if resp.status_code == 429:
                    raise DeepSeekError("DeepSeek rate limit exceeded (429)")
                if resp.status_code >= 400:
                    body = await resp.aread()
                    logger.error("DeepSeek stream error %s: %s", resp.status_code, body[:500])
                    raise DeepSeekError(f"DeepSeek вернул ошибку {resp.status_code}")

                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[len("data:"):].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = _json.loads(data)
                        delta = chunk["choices"][0].get("delta", {})
                        piece = delta.get("content")
                        if piece:
                            yield piece
                    except (KeyError, IndexError, ValueError):
                        continue
    except httpx.HTTPError as e:
        logger.exception("DeepSeek stream network error")
        raise DeepSeekError(f"Сетевая ошибка при обращении к DeepSeek: {e}") from e