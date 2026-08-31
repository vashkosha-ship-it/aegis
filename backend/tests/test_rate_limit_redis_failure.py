"""Сбой Redis не должен превращаться в тихое отключение rate limiting.

Любая ошибка Redis в рантайме раньше перехватывалась и работа продолжалась со
счётчиками в памяти процесса. В production это означает, что защита от
перебора исчезает ровно в тот момент, когда она нужнее всего.

Здесь же — проверки атомарности. Раньше «посмотреть, не превышен ли лимит» и
«засчитать попытку» были двумя отдельными обращениями. Десять параллельных
запросов успевали пройти проверку до того, как записался хоть один: лимит
«3 письма за 15 минут» обходился отправкой десяти писем одновременно.
"""
from __future__ import annotations

import asyncio

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

    eval = _boom
    ttl = _boom
    delete = _boom
    setex = _boom
    ping = _boom


@pytest.fixture
def broken_redis(monkeypatch):
    """Подменить клиент на сломанный и сбросить предохранитель.

    Подменяем результат get_redis(), а не переменную модуля: клиент теперь
    создаётся лениво и привязан к event loop, обращение к внутренней
    переменной проходило бы мимо.
    """
    client = _BrokenRedis()
    monkeypatch.setattr(rl, "get_redis", lambda: client)
    monkeypatch.setattr(rl, "redis_configured", lambda: True)
    rl.reset_circuit()
    yield client
    rl.reset_circuit()


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

    async def test_try_acquire_raises_503(self, broken_redis, production):
        limiter = rl.SlidingWindowLimiter(3, 900, "test")
        with pytest.raises(HTTPException) as exc:
            await limiter.try_acquire("someone@example.com")
        assert exc.value.status_code == 503

    async def test_record_raises_503(self, broken_redis, production):
        limiter = rl.SlidingWindowLimiter(3, 900, "test")
        with pytest.raises(HTTPException) as exc:
            await limiter.record("someone@example.com")
        assert exc.value.status_code == 503

    async def test_counters_do_not_leak_into_memory(self, broken_redis, production):
        """Попытка НЕ должна оказаться сосчитанной в памяти процесса.

        Иначе лимитер продолжил бы «работать», но по данным, которых не видят
        остальные воркеры.
        """
        limiter = rl.SlidingWindowLimiter(3, 900, "test")
        with pytest.raises(HTTPException):
            await limiter.try_acquire("key")
        assert limiter._store == {}, "попытка сосчиталась в памяти вместо отказа"


class TestDevelopmentFallsBack:
    async def test_try_acquire_uses_memory(self, broken_redis, development):
        limiter = rl.SlidingWindowLimiter(2, 900, "test")
        allowed, _ = await limiter.try_acquire("key")
        assert allowed is True

    async def test_limit_still_enforced_in_memory(self, broken_redis, development):
        limiter = rl.SlidingWindowLimiter(2, 900, "test")
        await limiter.try_acquire("key")
        await limiter.try_acquire("key")
        allowed, retry_after = await limiter.try_acquire("key")
        assert allowed is False
        assert retry_after > 0


class TestCircuitBreaker:
    async def test_stops_hammering_dead_redis(self, broken_redis, production):
        """После сбоя следующие запросы не должны снова ждать таймаута."""
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

    async def test_recovers_after_reset(self, broken_redis, production):
        limiter = rl.LoginRateLimiter()
        with pytest.raises(HTTPException):
            await limiter.check_allowed("10.0.0.3")

        rl.reset_circuit()
        before = broken_redis.calls
        with pytest.raises(HTTPException):
            await limiter.check_allowed("10.0.0.3")
        assert broken_redis.calls > before, "после сброса попытка не повторилась"


class TestRelaxingOperationsStayLenient:
    """Сброс счётчика ослабляет ограничение — за него отказывать не нужно."""

    async def test_record_success_does_not_raise(self, broken_redis, production):
        limiter = rl.LoginRateLimiter()
        await limiter.record_success("10.0.0.4")

    async def test_reset_does_not_raise(self, broken_redis, production):
        limiter = rl.SlidingWindowLimiter(3, 900, "test")
        await limiter.reset("key")


class TestAtomicity:
    """Параллельные запросы не должны проскакивать мимо лимита.

    Без Redis проверка идёт по памяти процесса — в одном event loop это тоже
    показательно: между «посмотреть» и «записать» не должно быть точки, где
    другая корутина увидит устаревший счётчик.
    """

    @pytest.fixture(autouse=True)
    def _memory_mode(self, monkeypatch):
        monkeypatch.setattr(rl, "redis_configured", lambda: False)
        monkeypatch.setattr(rl, "get_redis", lambda: None)
        monkeypatch.setattr(rl.settings, "DEBUG", True)

    async def test_parallel_try_acquire_respects_limit(self):
        limiter = rl.SlidingWindowLimiter(3, 900, "atomic")

        results = await asyncio.gather(
            *[limiter.try_acquire("same-key") for _ in range(20)]
        )
        allowed = sum(1 for ok, _ in results if ok)

        assert allowed == 3, f"пропущено {allowed} запросов при лимите 3"

    async def test_parallel_logins_respect_limit(self):
        limiter = rl.LoginRateLimiter(
            max_attempts=5, lockout_seconds=60, window_seconds=900
        )

        results = await asyncio.gather(
            *[limiter.check_allowed("10.0.0.5") for _ in range(50)]
        )
        allowed = sum(1 for ok, _ in results if ok)

        assert allowed == 5, (
            f"пропущено {allowed} попыток входа при лимите 5 — параллельные "
            "запросы обходят блокировку"
        )
