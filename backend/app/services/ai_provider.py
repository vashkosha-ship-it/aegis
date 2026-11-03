"""Какой ИИ-провайдер сейчас выбран: DeepSeek или GigaChat.

Выбор хранит администратор в app_settings (ключ ai_provider). Вызовы ИИ
идут и из API, и из фонового обработчика, у которого своя сессия БД, поэтому
читаем настройку сами и держим в памяти процесса несколько секунд: смена в
админке доходит до всех процессов не позже чем через _TTL секунд.
"""
from __future__ import annotations

import logging
import time

from app.core.config import settings
from app.services import app_settings

logger = logging.getLogger(__name__)

DEEPSEEK = "deepseek"
GIGACHAT = "gigachat"
PROVIDERS = (DEEPSEEK, GIGACHAT)
LABELS = {DEEPSEEK: "DeepSeek", GIGACHAT: "GigaChat"}

_TTL = 15.0
_cached: str | None = None
_cached_at = 0.0


def default_provider() -> str:
    value = (settings.AI_PROVIDER or "").strip().lower()
    return value if value in PROVIDERS else DEEPSEEK


def configured() -> dict[str, bool]:
    from app.services import gigachat_client

    return {
        DEEPSEEK: bool(settings.DEEPSEEK_API_KEY.strip()),
        GIGACHAT: gigachat_client.is_configured(),
    }


def normalize(value: object) -> str:
    value = str(value or "").strip().lower()
    return value if value in PROVIDERS else default_provider()


def remember(provider: str) -> None:
    """Запомнить выбор сразу (вызывается после сохранения в админке)."""
    global _cached, _cached_at
    _cached = normalize(provider)
    _cached_at = time.monotonic()


async def read(db) -> str:
    """Выбор из БД через переданную сессию (для API настроек)."""
    return normalize(await app_settings.get_setting(db, app_settings.AI_PROVIDER))


async def current() -> str:
    """Текущий провайдер для вызова ИИ из любого места."""
    if _cached is not None and time.monotonic() - _cached_at < _TTL:
        return _cached
    try:
        from app.db.session import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            provider = await read(db)
    except Exception:  # noqa: BLE001 — БД недоступна: не роняем ИИ, берём прошлое/умолчание
        logger.warning("Не удалось прочитать выбор ИИ-провайдера, использую %s", _cached or default_provider())
        return _cached or default_provider()
    remember(provider)
    return provider
