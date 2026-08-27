"""В production приложение не должно стартовать без работающего Redis.

Молчаливая деградация опаснее падения: при счётчиках в памяти процесса лимиты
умножаются на число воркеров и сбрасываются при каждом рестарте, а узнать об
этом можно только случайно.

Что изменилось после перехода на асинхронный клиент. Раньше недоступность
Redis обнаруживалась сама собой в момент создания клиента — синхронный
from_url сразу проверял связь. Асинхронный соединяется лениво, при первой
команде, поэтому проверка стала отдельной функцией init_rate_limit, которую
вызывает lifespan в main.py. Если её забыть вызвать, приложение поднимется с
неработающими лимитами — именно то, что этот файл и должен предотвращать.

Проверяем сами функции, а не перезагрузку модуля: importlib.reload внутри
теста оставляет пересозданные лимитеры в чужих модулях, и падение всплывает в
неожиданных местах.
"""
from __future__ import annotations

import pytest

from app.core import config, rate_limit
from app.core.rate_limit import RedisRequiredError, _make_redis, init_rate_limit

DEAD_REDIS = "redis://127.0.0.1:6399/0"


@pytest.fixture
def redis_env():
    """Временно подменить DEBUG и REDIS_URL, потом вернуть как было."""
    original_debug = config.settings.DEBUG
    original_url = config.settings.REDIS_URL

    def apply(*, debug: bool, redis_url: str):
        config.settings.DEBUG = debug
        config.settings.REDIS_URL = redis_url

    yield apply

    config.settings.DEBUG = original_debug
    config.settings.REDIS_URL = original_url


class TestConfigurationCheck:
    """Отсутствие настройки видно сразу, без обращения к сети."""

    def test_production_without_redis_url_fails(self, redis_env):
        redis_env(debug=False, redis_url="")

        with pytest.raises(RedisRequiredError, match="REDIS_URL"):
            _make_redis()

    def test_debug_without_redis_url_returns_none(self, redis_env):
        """В разработке fallback на память допустим."""
        redis_env(debug=True, redis_url="")

        assert _make_redis() is None

    def test_client_is_created_without_connecting(self, redis_env):
        """Клиент создаётся даже для заведомо мёртвого адреса.

        Это не недосмотр, а свойство асинхронного клиента: соединение
        откладывается до первой команды. Поэтому проверка связи вынесена
        в init_rate_limit — см. класс ниже.
        """
        redis_env(debug=False, redis_url=DEAD_REDIS)

        assert _make_redis() is not None


class TestStartupCheck:
    """Связь проверяется явно, при старте приложения."""

    async def test_production_with_dead_redis_refuses_to_start(
        self, redis_env, monkeypatch
    ):
        redis_env(debug=False, redis_url=DEAD_REDIS)
        monkeypatch.setattr(rate_limit, "_redis", _make_redis())

        with pytest.raises(RedisRequiredError, match="недоступен"):
            await init_rate_limit()

    async def test_debug_with_dead_redis_starts_anyway(
        self, redis_env, monkeypatch
    ):
        redis_env(debug=True, redis_url=DEAD_REDIS)
        monkeypatch.setattr(rate_limit, "_redis", _make_redis())

        await init_rate_limit()  # не должно бросить

    async def test_without_redis_check_is_skipped(self, redis_env, monkeypatch):
        redis_env(debug=True, redis_url="")
        monkeypatch.setattr(rate_limit, "_redis", None)

        await init_rate_limit()


class TestInMemoryFallback:
    """Лимитер обязан работать и без Redis — иначе разработка встанет."""

    async def test_limiter_counts_without_redis(self, monkeypatch):
        monkeypatch.setattr(rate_limit, "_redis", None)

        limiter = rate_limit.SlidingWindowLimiter(
            max_actions=2, window_seconds=60, prefix="test-fallback"
        )
        key = "some-key"

        allowed, _ = await limiter.check_allowed(key)
        assert allowed is True

        await limiter.record(key)
        await limiter.record(key)

        allowed, wait = await limiter.check_allowed(key)
        assert allowed is False
        assert wait > 0

        await limiter.reset(key)
        allowed, _ = await limiter.check_allowed(key)
        assert allowed is True
