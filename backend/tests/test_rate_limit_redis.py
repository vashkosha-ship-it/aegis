"""Тесты rate limiting поверх Redis.

Обычные тесты лимитов гоняются на счётчиках в памяти, а на сервере работает
Redis — то есть проверялся не тот путь. Здесь проверяем именно его, включая
главное свойство, ради которого Redis и вводился: счётчик общий для всех
процессов приложения.

Без Redis тесты пропускаются: локально его может не быть, в CI он поднят.
Из-за этого файл долго жил незамеченным — восемь молчаливых пропусков в каждом
локальном прогоне, а в CI он сломался при переходе лимитера на асинхронный
клиент. Если запускаете тесты локально, стоит поднять Redis: иначе именно эта
часть остаётся непроверенной.
"""
from __future__ import annotations

import asyncio
import time

import pytest

from app.core import rate_limit
from app.core.rate_limit import LoginRateLimiter, SlidingWindowLimiter

pytestmark = pytest.mark.skipif(
    not rate_limit.redis_available(),
    reason="Redis не запущен — проверять нечего",
)


@pytest.fixture
def unique_prefix(request):
    """Свой префикс ключей на каждый тест, чтобы они не мешали друг другу."""
    return f"test-{request.node.name}-{int(time.time() * 1000)}"


@pytest.fixture
def unique_ip(request):
    """Свой адрес на каждый тест: ключи блокировки живут в общем Redis."""
    return f"203.0.113.{abs(hash(request.node.name)) % 250 + 1}"


class TestSlidingWindow:
    async def test_counts_across_instances(self, unique_prefix):
        """Главное свойство: разные экземпляры видят один счётчик.

        Так же ведут себя воркеры gunicorn: у каждого свой объект лимитера,
        но лимит должен быть общим. В памяти процесса «5 попыток» превращались
        в 5×N.
        """
        worker_a = SlidingWindowLimiter(2, 60, unique_prefix)
        worker_b = SlidingWindowLimiter(2, 60, unique_prefix)

        await worker_a.record("user@example.com")
        await worker_b.record("user@example.com")

        allowed, wait = await worker_b.check_allowed("user@example.com")
        assert allowed is False, "второй воркер должен видеть попытки первого"
        assert wait > 0

    async def test_separate_keys_independent(self, unique_prefix):
        limiter = SlidingWindowLimiter(1, 60, unique_prefix)

        await limiter.record("alice")
        allowed, _ = await limiter.check_allowed("bob")
        assert allowed is True

    async def test_window_slides(self, unique_prefix):
        """Старые попытки выпадают по времени, а не по истечении TTL ключа."""
        limiter = SlidingWindowLimiter(1, 1, unique_prefix)  # окно 1 секунда

        await limiter.record("k")
        allowed, _ = await limiter.check_allowed("k")
        assert allowed is False

        await asyncio.sleep(1.2)
        allowed, _ = await limiter.check_allowed("k")
        assert allowed is True

    async def test_reset_clears(self, unique_prefix):
        limiter = SlidingWindowLimiter(1, 60, unique_prefix)

        await limiter.record("k")
        allowed, _ = await limiter.check_allowed("k")
        assert allowed is False

        await limiter.reset("k")
        allowed, _ = await limiter.check_allowed("k")
        assert allowed is True


class TestSlidingWindowAtomicity:
    """try_acquire проверяет и засчитывает одной операцией Redis.

    Ради этого и появился Lua-скрипт: связка «посмотреть, потом записать»
    пропускала параллельные запросы все разом, потому что до записи не успевал
    дойти ни один.
    """

    async def test_parallel_requests_respect_limit(self, unique_prefix):
        limiter = SlidingWindowLimiter(3, 60, unique_prefix)

        results = await asyncio.gather(
            *[limiter.try_acquire("same-key") for _ in range(20)]
        )
        allowed = sum(1 for ok, _ in results if ok)

        assert allowed == 3, f"пропущено {allowed} запросов при лимите 3"

    async def test_acquire_counts_the_attempt(self, unique_prefix):
        """Успешный try_acquire должен занимать место в окне."""
        limiter = SlidingWindowLimiter(1, 60, unique_prefix)

        first, _ = await limiter.try_acquire("k")
        second, wait = await limiter.try_acquire("k")

        assert first is True
        assert second is False
        assert wait > 0


class TestLoginLimiter:
    """У лимитера входа изменилась семантика, и это важно помнить.

    check_allowed теперь не только проверяет, но и засчитывает попытку, а
    record_failure ничего не делает. Раньше считались только неудачи, и сотня
    одновременных запросов с неверным паролем проходила проверку целиком: ни
    один ещё не успел записаться. Теперь считается каждая попытка, а успешный
    вход счётчик обнуляет.
    """

    async def test_lockout_after_attempts(self, unique_ip):
        limiter = LoginRateLimiter(max_attempts=3, lockout_seconds=60)

        for number in range(3):
            allowed, _ = await limiter.check_allowed(unique_ip)
            assert allowed is True, f"попытка {number + 1} должна проходить"

        allowed, remaining = await limiter.check_allowed(unique_ip)
        assert allowed is False, "после исчерпания попыток адрес блокируется"
        assert remaining > 0

        await limiter.record_success(unique_ip)  # уборка за собой

    async def test_success_clears_counter(self, unique_ip):
        limiter = LoginRateLimiter(max_attempts=3, lockout_seconds=60)

        await limiter.check_allowed(unique_ip)
        await limiter.check_allowed(unique_ip)
        await limiter.record_success(unique_ip)

        # Счётчик обнулён — снова доступны все попытки
        for _ in range(3):
            allowed, _ = await limiter.check_allowed(unique_ip)
            assert allowed is True

        await limiter.record_success(unique_ip)

    async def test_different_ips_independent(self, unique_ip):
        """После фикса определения IP за nginx адреса действительно разные."""
        limiter = LoginRateLimiter(max_attempts=2, lockout_seconds=60)
        ip_a = unique_ip
        ip_b = f"198.51.100.{unique_ip.rsplit('.', 1)[-1]}"

        for _ in range(3):
            await limiter.check_allowed(ip_a)

        allowed_a, _ = await limiter.check_allowed(ip_a)
        allowed_b, _ = await limiter.check_allowed(ip_b)

        assert allowed_a is False
        assert allowed_b is True, (
            "блокировка одного адреса не должна задевать остальных"
        )

        await limiter.record_success(ip_a)
        await limiter.record_success(ip_b)

    async def test_parallel_attempts_respect_limit(self, unique_ip):
        """Одновременные попытки не должны проскакивать мимо блокировки."""
        limiter = LoginRateLimiter(max_attempts=5, lockout_seconds=60)

        results = await asyncio.gather(
            *[limiter.check_allowed(unique_ip) for _ in range(50)]
        )
        allowed = sum(1 for ok, _ in results if ok)

        assert allowed == 5, (
            f"пропущено {allowed} попыток при лимите 5 — параллельные запросы "
            "обходят блокировку"
        )

        await limiter.record_success(unique_ip)


class TestPersistence:
    async def test_counter_survives_new_instance(self, unique_prefix):
        """Пересоздание объекта = рестарт воркера: счётчик должен уцелеть."""
        first = SlidingWindowLimiter(3, 60, unique_prefix)
        await first.record("k")
        await first.record("k")

        after_restart = SlidingWindowLimiter(3, 60, unique_prefix)
        await after_restart.record("k")

        allowed, _ = await after_restart.check_allowed("k")
        assert allowed is False


class TestUsesRedisNotMemory:
    """Страховка: тесты должны проверять Redis, а не память процесса.

    Если клиент однажды перестанет создаваться, все проверки выше начнут
    гоняться на счётчиках в памяти и продолжат проходить — измеряя не то.
    """

    async def test_redis_client_is_in_use(self):
        client = rate_limit.get_redis()
        assert client is not None, "клиент Redis не создан"
        await client.ping()

    async def test_counters_land_in_redis(self, unique_prefix):
        limiter = SlidingWindowLimiter(5, 60, unique_prefix)
        await limiter.record("probe")

        client = rate_limit.get_redis()
        assert await client.exists(f"rl:{unique_prefix}:probe") == 1, (
            "счётчик не попал в Redis — работа идёт в памяти процесса"
        )
