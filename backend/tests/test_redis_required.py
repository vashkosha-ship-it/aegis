"""Тест: в production приложение не должно стартовать без Redis.

Молчаливая деградация опаснее падения — при работе в памяти процесса лимиты
умножаются на число воркеров и сбрасываются при каждом рестарте, а узнать об
этом можно только случайно.

Проверяем саму функцию подключения, а не перезагрузку модуля: importlib.reload
внутри теста оставляет пересозданные лимитеры в чужих модулях, и падение
всплывает в неожиданных местах.
"""
from __future__ import annotations

import pytest

from app.core import config
from app.core.rate_limit import RedisRequiredError, _make_redis


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


class TestRedisRequirement:
    def test_production_without_redis_url_fails(self, redis_env):
        redis_env(debug=False, redis_url="")

        with pytest.raises(RedisRequiredError, match="REDIS_URL"):
            _make_redis()

    def test_production_with_dead_redis_fails(self, redis_env):
        redis_env(debug=False, redis_url="redis://127.0.0.1:6399/0")

        with pytest.raises(RedisRequiredError, match="недоступен"):
            _make_redis()

    def test_debug_without_redis_returns_none(self, redis_env):
        """В разработке fallback на память допустим."""
        redis_env(debug=True, redis_url="")

        assert _make_redis() is None

    def test_debug_with_dead_redis_returns_none(self, redis_env):
        redis_env(debug=True, redis_url="redis://127.0.0.1:6399/0")

        assert _make_redis() is None


class TestInMemoryFallback:
    """Лимитер обязан работать и без Redis — иначе разработка встанет."""

    def test_limiter_counts_without_redis(self):
        from app.core.rate_limit import SlidingWindowLimiter

        limiter = SlidingWindowLimiter(
            max_actions=2, window_seconds=60, prefix="test-fallback"
        )
        key = "some-key"

        assert limiter.check_allowed(key)[0] is True
        limiter.record(key)
        limiter.record(key)

        allowed, wait = limiter.check_allowed(key)
        assert allowed is False
        assert wait > 0

        limiter.reset(key)
        assert limiter.check_allowed(key)[0] is True
