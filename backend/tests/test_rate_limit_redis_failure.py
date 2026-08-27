"""Сбой Redis не должен превращаться в тихое отключение rate limiting.

Раньше любая ошибка Redis в рантайме перехватывалась, писалась в лог и работа
продолжалась со счётчиками в памяти процесса. В production это означает, что
защита от перебора исчезает ровно в тот момент, когда она нужнее всего, и
единственный след — строчка в логе.

Здесь проверяется, что в production такой сбой приводит к отказу (503), а в
режиме разработки по-прежнему допускается работа в памяти.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.core import rate_limit as rl


class _BrokenPipeline:
    """Пайплайн, который собирает команды, но падает при выполнении."""

    def __init__(self, parent: _BrokenRedis) -> None:
        self._parent = parent

    def __getattr__(self, _name):
        return lambda *a, **kw: self

    async def execute(self):
        self._parent.calls += 1
        raise ConnectionError("Connection refused")


class _BrokenRedis:
    """Клиент, падающий на любой операции — как настоящий недоступный Redis."""

    def __init__(self) -> None:
        self.calls = 0

    def pipeline(self, *args, **kwargs):
        return _BrokenPipeline(self)

    async def _boom(self, *args, **kwargs):
        self.calls += 1
        raise ConnectionError("Connection refused")

    ttl = _boom
    delete = _boom
    setex = _boom
    ping = _boom


@pytest.fixture
def broken_redis(monkeypatch):
    """Подменяем клиент на сломанный и сбрасываем предохранитель."""
    client = _BrokenRedis()
    monkeypatch.setattr(rl, "_redis", client)
    monkeypatch.setattr(rl, "_circuit_open_until", 0.0)
    return client


@pytest.fixture
def production(monkeypatch):
    monkeypatch.setattr(rl.settings, "DEBUG", False)


@pytest.fixture
def development(monkeypatch):
    monkeypatch.setattr(rl.settings, "DEBUG", True)


class TestProductionFailsClosed:
    async def test_login_check_raises_503(self, broken_redis, production):
        limiter = rl.LoginRateLimiter()
        with pytest.raises(HTTPException) as exc:
            await limiter.check_allowed("10.0.0.1")
        assert exc.value.status_code == 503

    async def test_login_record_failure_raises_503(self, broken_redis, production):
        limiter = rl.LoginRateLimiter()
        with pytest.raises(HTTPException) as exc:
            await limiter.record_failure("10.0.0.1")
        assert exc.value.status_code == 503

    async def test_sliding_window_check_raises_503(self, broken_redis, production):
        limiter = rl.SlidingWindowLimiter(3, 900, "test")
        with pytest.raises(HTTPException) as exc:
            await limiter.check_allowed("someone@example.com")
        assert exc.value.status_code == 503

    async def test_sliding_window_record_raises_503(self, broken_redis, production):
        limiter = rl.SlidingWindowLimiter(3, 900, "test")
        with pytest.raises(HTTPException) as exc:
            await limiter.record("someone@example.com")
        assert exc.value.status_code == 503

    async def test_counters_do_not_leak_into_memory(self, broken_redis, production):
        """Главное: попытка НЕ должна оказаться сосчитанной в памяти процесса.

        Если бы сбой приводил к откату в память, запись прошла бы успешно и
        счётчик вырос — то есть лимитер продолжил бы «работать», но по данным,
        которых не видят остальные воркеры.
        """
        limiter = rl.SlidingWindowLimiter(3, 900, "test")
        with pytest.raises(HTTPException):
            await limiter.record("key")
        assert limiter._store == {}, "попытка сосчиталась в памяти вместо отказа"


class TestDevelopmentFallsBack:
    async def test_check_allowed_uses_memory(self, broken_redis, development):
        limiter = rl.SlidingWindowLimiter(2, 900, "test")
        allowed, _ = await limiter.check_allowed("key")
        assert allowed is True

    async def test_limit_still_enforced_in_memory(self, broken_redis, development):
        limiter = rl.SlidingWindowLimiter(2, 900, "test")
        await limiter.record("key")
        await limiter.record("key")
        allowed, retry_after = await limiter.check_allowed("key")
        assert allowed is False
        assert retry_after > 0


class TestCircuitBreaker:
    async def test_stops_hammering_dead_redis(self, broken_redis, production):
        """После сбоя следующие запросы не должны снова ждать таймаута.

        Без предохранителя каждый запрос упирался бы в socket_timeout, и
        упавший Redis превращался бы в лавину висящих соединений.
        """
        limiter = rl.LoginRateLimiter()

        with pytest.raises(HTTPException):
            await limiter.check_allowed("10.0.0.2")
        calls_after_first = broken_redis.calls

        for _ in range(5):
            with pytest.raises(HTTPException):
                await limiter.check_allowed("10.0.0.2")

        assert broken_redis.calls == calls_after_first, (
            "к недоступному Redis продолжают ходить на каждом запросе"
        )

    async def test_recovers_after_timeout(self, broken_redis, production, monkeypatch):
        limiter = rl.LoginRateLimiter()
        with pytest.raises(HTTPException):
            await limiter.check_allowed("10.0.0.3")

        # Предохранитель закрывается по истечении окна
        monkeypatch.setattr(rl, "_circuit_open_until", 0.0)
        before = broken_redis.calls
        with pytest.raises(HTTPException):
            await limiter.check_allowed("10.0.0.3")
        assert broken_redis.calls > before, "после паузы попытка не повторилась"


class TestRelaxingOperationsStayLenient:
    """Сброс счётчика ослабляет ограничение — за него отказывать не нужно."""

    async def test_record_success_does_not_raise(self, broken_redis, production):
        limiter = rl.LoginRateLimiter()
        await limiter.record_success("10.0.0.4")  # не должно бросить

    async def test_reset_does_not_raise(self, broken_redis, production):
        limiter = rl.SlidingWindowLimiter(3, 900, "test")
        await limiter.reset("key")


# Поведение при старте (нет REDIS_URL, Redis не отвечает при запуске)
# проверяется в test_redis_required.py — здесь только сбои во время работы.
