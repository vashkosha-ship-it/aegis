"""Жизненный цикл Redis и требование его наличия в production.

Два разных вопроса, оба здесь.

Первый: в production приложение не должно стартовать без работающего Redis.
Молчаливая деградация опаснее падения — при счётчиках в памяти процесса лимиты
умножаются на число воркеров и сбрасываются при каждом рестарте.

Второй появился после болезненной ошибки. Клиент создавался один раз при
импорте модуля и закрывался в lifespan через aclose(). После первого же
завершения жизненного цикла переменная указывала на закрытый клиент,
привязанный к несуществующему event loop, и каждый следующий запрос падал —
причём в 503, из-за политики «не можем посчитать, значит не пропускаем».
Осторожное поведение усилило поломку. Тесты ниже следят, чтобы это не
вернулось.
"""
from __future__ import annotations

import asyncio

import pytest

from app.core import config, rate_limit
from app.core.rate_limit import RedisRequiredError, init_rate_limit

DEAD_REDIS = "redis://127.0.0.1:6399/0"


@pytest.fixture
def redis_env():
    """Временно подменить DEBUG и REDIS_URL, потом вернуть как было."""
    original_debug = config.settings.DEBUG
    original_url = config.settings.REDIS_URL

    def apply(*, debug: bool, redis_url: str):
        config.settings.DEBUG = debug
        config.settings.REDIS_URL = redis_url
        # Настройки поменялись — клиент от прежних больше не годится
        rate_limit._client = None
        rate_limit._client_loop = None
        rate_limit.reset_circuit()

    yield apply

    config.settings.DEBUG = original_debug
    config.settings.REDIS_URL = original_url
    rate_limit._client = None
    rate_limit._client_loop = None
    rate_limit.reset_circuit()


class TestConfigurationCheck:
    async def test_production_without_redis_url_fails(self, redis_env):
        redis_env(debug=False, redis_url="")

        with pytest.raises(RedisRequiredError, match="REDIS_URL"):
            await init_rate_limit()

    async def test_debug_without_redis_url_is_allowed(self, redis_env):
        """В разработке fallback на память допустим."""
        redis_env(debug=True, redis_url="")

        await init_rate_limit()  # не должно бросить
        assert rate_limit.get_redis() is None

    async def test_client_is_created_without_connecting(self, redis_env):
        """Клиент создаётся даже для заведомо мёртвого адреса.

        Это свойство асинхронного клиента: соединение откладывается до первой
        команды. Поэтому проверка связи вынесена в init_rate_limit.
        """
        redis_env(debug=False, redis_url=DEAD_REDIS)

        assert rate_limit.get_redis() is not None


class TestStartupCheck:
    async def test_production_with_dead_redis_refuses_to_start(self, redis_env):
        redis_env(debug=False, redis_url=DEAD_REDIS)

        with pytest.raises(RedisRequiredError, match="недоступен"):
            await init_rate_limit()

    async def test_debug_with_dead_redis_starts_anyway(self, redis_env):
        redis_env(debug=True, redis_url=DEAD_REDIS)

        await init_rate_limit()  # не должно бросить


class TestLifecycle:
    """Повторный запуск жизненного цикла — ровно та поломка."""

    async def test_close_releases_the_client(self, redis_env):
        redis_env(debug=True, redis_url=DEAD_REDIS)
        assert rate_limit.get_redis() is not None

        await rate_limit.close_rate_limit()

        assert rate_limit._client is None, (
            "ссылка на закрытый клиент осталась — следующий цикл получит его "
            "и все запросы завершатся отказом"
        )

    async def test_client_is_recreated_after_close(self, redis_env):
        redis_env(debug=True, redis_url=DEAD_REDIS)

        first = rate_limit.get_redis()
        await rate_limit.close_rate_limit()
        second = rate_limit.get_redis()

        assert second is not None, "после закрытия клиент не пересоздался"
        assert second is not first, "вернулся тот же, уже закрытый клиент"

    async def test_second_lifespan_works(self, redis_env):
        """Полный цикл дважды подряд — как при перезапуске воркера."""
        redis_env(debug=True, redis_url=DEAD_REDIS)

        await init_rate_limit()
        await rate_limit.close_rate_limit()

        await init_rate_limit()
        assert rate_limit.get_redis() is not None
        await rate_limit.close_rate_limit()

    async def test_circuit_is_reset_on_startup(self, redis_env):
        """Новый цикл не должен начинаться с памятью о прошлых сбоях.

        Иначе после перезапуска первые несколько секунд все запросы получают
        отказ по причине, которой уже нет.
        """
        redis_env(debug=True, redis_url=DEAD_REDIS)
        rate_limit._circuit_open_until = asyncio.get_running_loop().time() + 10_000

        await init_rate_limit()

        assert rate_limit._circuit_open_until == 0.0

    async def test_circuit_is_reset_on_close(self, redis_env):
        redis_env(debug=True, redis_url=DEAD_REDIS)
        rate_limit._circuit_open_until = 10_000_000_000.0

        await rate_limit.close_rate_limit()

        assert rate_limit._circuit_open_until == 0.0


class TestInMemoryFallback:
    """Лимитер обязан работать и без Redis — иначе разработка встанет."""

    async def test_limiter_counts_without_redis(self, redis_env):
        redis_env(debug=True, redis_url="")

        limiter = rate_limit.SlidingWindowLimiter(
            max_actions=2, window_seconds=60, prefix="test-fallback"
        )
        key = "some-key"

        allowed, _ = await limiter.try_acquire(key)
        assert allowed is True
        allowed, _ = await limiter.try_acquire(key)
        assert allowed is True

        allowed, wait = await limiter.try_acquire(key)
        assert allowed is False
        assert wait > 0

        await limiter.reset(key)
        allowed, _ = await limiter.try_acquire(key)
        assert allowed is True

    async def test_login_limiter_counts_without_redis(self, redis_env):
        redis_env(debug=True, redis_url="")

        limiter = rate_limit.LoginRateLimiter(
            max_attempts=3, lockout_seconds=60, window_seconds=900
        )

        for _ in range(3):
            allowed, _ = await limiter.check_allowed("10.0.0.9")
            assert allowed is True

        allowed, wait = await limiter.check_allowed("10.0.0.9")
        assert allowed is False
        assert wait > 0
