"""Тесты rate limiting поверх Redis.

Обычные тесты лимитов гоняются на счётчиках в памяти, а на сервере работает
Redis — то есть проверялся не тот путь. Здесь проверяем именно его, включая
главное свойство, ради которого Redis и вводился: счётчик общий для всех
процессов приложения.

Без Redis тесты пропускаются: локально его может не быть, в CI он поднят.
"""
from __future__ import annotations

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


class TestSlidingWindow:
    def test_counts_across_instances(self, unique_prefix):
        """Главное свойство: разные экземпляры видят один счётчик.

        Так же ведут себя воркеры gunicorn: у каждого свой объект лимитера,
        но лимит должен быть общим. В памяти процесса «5 попыток» превращались
        в 5×N.
        """
        worker_a = SlidingWindowLimiter(2, 60, unique_prefix)
        worker_b = SlidingWindowLimiter(2, 60, unique_prefix)

        worker_a.record("user@example.com")
        worker_b.record("user@example.com")

        allowed, wait = worker_b.check_allowed("user@example.com")
        assert allowed is False, "второй воркер должен видеть попытки первого"
        assert wait > 0

    def test_separate_keys_independent(self, unique_prefix):
        limiter = SlidingWindowLimiter(1, 60, unique_prefix)

        limiter.record("alice")
        assert limiter.check_allowed("bob")[0] is True

    def test_window_slides(self, unique_prefix):
        """Старые попытки выпадают по времени, а не по истечении TTL ключа."""
        limiter = SlidingWindowLimiter(1, 1, unique_prefix)  # окно 1 секунда

        limiter.record("k")
        assert limiter.check_allowed("k")[0] is False

        time.sleep(1.2)
        assert limiter.check_allowed("k")[0] is True

    def test_reset_clears(self, unique_prefix):
        limiter = SlidingWindowLimiter(1, 60, unique_prefix)

        limiter.record("k")
        assert limiter.check_allowed("k")[0] is False

        limiter.reset("k")
        assert limiter.check_allowed("k")[0] is True


class TestLoginLimiter:
    def test_lockout_after_failures(self):
        limiter = LoginRateLimiter(max_attempts=3, lockout_seconds=60)
        ip = f"203.0.113.{int(time.time()) % 200}"

        for _ in range(3):
            limiter.record_failure(ip)

        allowed, remaining = limiter.check_allowed(ip)
        assert allowed is False
        assert remaining > 0

        limiter.record_success(ip)  # уборка за собой

    def test_success_clears_counter(self):
        limiter = LoginRateLimiter(max_attempts=3, lockout_seconds=60)
        ip = f"198.51.100.{int(time.time()) % 200}"

        limiter.record_failure(ip)
        limiter.record_failure(ip)
        limiter.record_success(ip)

        # Счётчик обнулён: следующие две неудачи не должны блокировать
        limiter.record_failure(ip)
        assert limiter.check_allowed(ip)[0] is True

        limiter.record_success(ip)

    def test_different_ips_independent(self):
        """После фикса определения IP за nginx адреса действительно разные."""
        limiter = LoginRateLimiter(max_attempts=2, lockout_seconds=60)
        suffix = int(time.time()) % 200
        ip_a, ip_b = f"192.0.2.{suffix}", f"192.0.2.{(suffix + 1) % 254}"

        limiter.record_failure(ip_a)
        limiter.record_failure(ip_a)

        assert limiter.check_allowed(ip_a)[0] is False
        assert limiter.check_allowed(ip_b)[0] is True, (
            "блокировка одного адреса не должна задевать остальных"
        )

        limiter.record_success(ip_a)
        limiter.record_success(ip_b)


class TestPersistence:
    def test_counter_survives_new_instance(self, unique_prefix):
        """Пересоздание объекта = рестарт воркера: счётчик должен уцелеть."""
        first = SlidingWindowLimiter(3, 60, unique_prefix)
        first.record("k")
        first.record("k")

        after_restart = SlidingWindowLimiter(3, 60, unique_prefix)
        after_restart.record("k")

        assert after_restart.check_allowed("k")[0] is False
