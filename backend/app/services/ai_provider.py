"""Какой ИИ-сервис отвечает за какую работу: DeepSeek или GigaChat.

Работа делится на две части, у каждой свой выбор в админке:
  - assistant — общение с пользователями (ассистент, «Объяснить» в читалке)
    и составление тестов: тесты по книгам и аттестация на сертификат;
  - books — обработка книг: описания, заполнение карточек, темы AR-схем.

Выбор хранится в app_settings. Вызовы ИИ идут и из API, и из фонового
обработчика, поэтому настройку читаем сами и держим в памяти процесса
несколько секунд: смена в админке доходит до всех процессов не позже _TTL.

Если выбранный сервис не подключён (нет ключа на сервере), а другой
подключён — работаем через другой, чтобы ИИ не «падал» из-за настройки.
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

ASSISTANT = "assistant"
BOOKS = "books"
TASKS = (ASSISTANT, BOOKS)
TASK_LABELS = {
    ASSISTANT: "Общение с пользователями и тесты",
    BOOKS: "Обработка книг: описания, карточки, темы",
}
SETTING_KEYS = {
    ASSISTANT: app_settings.AI_PROVIDER_ASSISTANT,
    BOOKS: app_settings.AI_PROVIDER_BOOKS,
}

_TTL = 15.0
_cache: dict[str, tuple[str, float]] = {}


def default_provider(task: str) -> str:
    raw = settings.AI_PROVIDER_ASSISTANT if task == ASSISTANT else settings.AI_PROVIDER_BOOKS
    value = (raw or "").strip().lower()
    return value if value in PROVIDERS else (GIGACHAT if task == ASSISTANT else DEEPSEEK)


def configured() -> dict[str, bool]:
    from app.services import gigachat_client

    return {
        DEEPSEEK: bool(settings.DEEPSEEK_API_KEY.strip()),
        GIGACHAT: gigachat_client.is_configured(),
    }


def normalize(task: str, value: object) -> str:
    value = str(value or "").strip().lower()
    return value if value in PROVIDERS else default_provider(task)


def effective(provider: str) -> str:
    """Выбранный сервис, а если он не подключён и подключён другой — другой."""
    ready = configured()
    if ready.get(provider):
        return provider
    other = GIGACHAT if provider == DEEPSEEK else DEEPSEEK
    return other if ready.get(other) else provider


def remember(task: str, provider: str) -> None:
    """Запомнить выбор сразу (вызывается после сохранения в админке)."""
    _cache[task] = (normalize(task, provider), time.monotonic())


def forget() -> None:
    _cache.clear()


async def read(db, task: str) -> str:
    """Выбор из БД через переданную сессию (для API настроек)."""
    return normalize(task, await app_settings.get_setting(db, SETTING_KEYS[task]))


async def current(task: str = ASSISTANT) -> str:
    """Сервис, который сейчас выполняет работу task."""
    cached = _cache.get(task)
    if cached and time.monotonic() - cached[1] < _TTL:
        return effective(cached[0])
    try:
        from app.db.session import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            provider = await read(db, task)
    except Exception:  # noqa: BLE001 — БД недоступна: не роняем ИИ, берём прошлое/умолчание
        provider = cached[0] if cached else default_provider(task)
        logger.warning("Не удалось прочитать выбор ИИ для %s, использую %s", task, provider)
        return effective(provider)
    remember(task, provider)
    return effective(provider)
