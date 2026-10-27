"""Очередь фоновых задач на ARQ поверх Redis.

Зачем: индексация PDF занимает минуты на большой книге. Если делать её в
обработчике запроса, воркер gunicorn на всё это время выключается из
обслуживания сайта, а «переиндексировать все» на каталоге в тысячи книг
просто отваливается по таймауту.

Задачи выполняет отдельный процесс (systemd-юнит aegis-worker), поэтому они
переживают перезапуск веб-приложения и не занимают его воркеры.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.core.config import settings

logger = logging.getLogger(__name__)

_pool: ArqRedis | None = None


def redis_settings() -> RedisSettings | None:
    """Настройки подключения для ARQ или None, если Redis не сконфигурирован."""
    url = getattr(settings, "REDIS_URL", "") or ""
    if not url:
        return None
    return RedisSettings.from_dsn(url)


async def get_queue() -> ArqRedis | None:
    """Пул подключений к очереди. None — очередь недоступна.

    Вызывающий код обязан обработать None: без Redis фоновые задачи ставить
    некуда, и эндпоинт должен честно сказать об этом, а не молча потерять
    работу.
    """
    global _pool
    if _pool is not None:
        return _pool

    rs = redis_settings()
    if rs is None:
        # В production сюда не дойдём: приложение не стартует без Redis
        # (см. app/core/rate_limit.py). Здесь — только режим разработки.
        logger.warning("REDIS_URL не задан — фоновые задачи недоступны")
        return None

    try:
        _pool = await create_pool(rs)
        return _pool
    except Exception as e:  # noqa: BLE001
        logger.error("Не удалось подключиться к очереди задач: %s", e)
        return None


async def close_queue() -> None:
    """Закрыть пул при остановке приложения."""
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None


# ARQ берёт задачи по времени постановки (score в sorted set). Задача, которую
# запустил администратор, иначе ждёт за всеми книгами в очереди на
# индексацию — при массовой загрузке это часы. Время «в прошлом» ставит её
# в начало очереди; индексация продолжится во втором слоте воркера.
PRIORITY_SCORE_TIME = datetime(2000, 1, 1, tzinfo=UTC)
# Срок жизни задачи в Redis задаём явно: по умолчанию ARQ считает его от
# времени запуска, и для времени «в прошлом» он выходит отрицательным —
# Redis отвечает ошибкой, а эндпоинт — 500.
PRIORITY_JOB_EXPIRES = timedelta(days=2)


async def enqueue_priority(queue, function: str, *args):
    """Поставить задачу в начало очереди."""
    return await queue.enqueue_job(
        function, *args, _defer_until=PRIORITY_SCORE_TIME, _expires=PRIORITY_JOB_EXPIRES,
    )
