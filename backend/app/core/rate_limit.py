"""Простой in-memory rate limiter для защиты от брутфорса.

Применяется к /auth/login и /auth/token. После N неудачных попыток
с одного IP блокирует дальнейшие запросы на T секунд.

Хранилище в памяти процесса — при перезапуске сбрасывается. Этого хватит
для одиночного uvicorn. Если в будущем будет несколько воркеров —
переехать на Redis.
"""
from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field
from threading import Lock


@dataclass
class _Entry:
    failed_attempts: int = 0
    locked_until: float = 0.0  # unix timestamp, до которого IP заблокирован
    last_attempt: float = field(default_factory=time.time)


class LoginRateLimiter:
    """Считает неудачные попытки логина по IP."""

    def __init__(
        self,
        max_attempts: int = 5,
        lockout_seconds: int = 300,     # 5 минут блокировка
        window_seconds: int = 900,      # сброс счётчика через 15 минут бездействия
    ) -> None:
        self.max_attempts = max_attempts
        self.lockout_seconds = lockout_seconds
        self.window_seconds = window_seconds
        self._store: dict[str, _Entry] = defaultdict(_Entry)
        self._lock = Lock()

    def check_allowed(self, ip: str) -> tuple[bool, int]:
        """Проверить можно ли пробовать логин.

        Возвращает (allowed, seconds_remaining):
        - (True, 0) — можно пробовать
        - (False, N) — заблокирован, осталось N секунд
        """
        now = time.time()
        with self._lock:
            entry = self._store[ip]
            # Сброс счётчика если давно не было активности
            if now - entry.last_attempt > self.window_seconds:
                entry.failed_attempts = 0
                entry.locked_until = 0
            # Проверка блокировки
            if entry.locked_until > now:
                return False, int(entry.locked_until - now)
            return True, 0

    def record_failure(self, ip: str) -> None:
        """Записать неудачную попытку. При превышении — заблокировать."""
        now = time.time()
        with self._lock:
            entry = self._store[ip]
            entry.failed_attempts += 1
            entry.last_attempt = now
            if entry.failed_attempts >= self.max_attempts:
                entry.locked_until = now + self.lockout_seconds

    def record_success(self, ip: str) -> None:
        """Успешный логин — сбрасываем счётчик."""
        with self._lock:
            if ip in self._store:
                del self._store[ip]


# Singleton — один на процесс
login_limiter = LoginRateLimiter()