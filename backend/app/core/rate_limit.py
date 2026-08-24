"""Rate limiting: защита от брутфорса и спама.

Хранилище — Redis, если он доступен, иначе память процесса.

Почему это важно: бэкенд работает под gunicorn с несколькими воркерами, и у
каждого своя память. При счётчиках в памяти лимит «5 попыток» превращается в
5×N попыток, а рестарт сервиса обнуляет блокировки. Redis делает счётчики
общими и переживает перезапуск.

Фолбэк на память нужен для локальной разработки и CI, где Redis не поднят:
приложение продолжает работать, просто с прежними ограничениями.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from threading import Lock

from app.core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Подключение к Redis
# ---------------------------------------------------------------------------

def _make_redis():
    """Синхронный клиент Redis или None, если он недоступен.

    Клиент синхронный намеренно: операции лимитера занимают доли миллисекунды
    на localhost, а асинхронный вариант потребовал бы делать async все вызовы
    в auth.py и me.py.
    """
    url = getattr(settings, "REDIS_URL", "") or ""
    if not url:
        return None
    try:
        import redis

        client = redis.Redis.from_url(url, decode_responses=True, socket_timeout=1)
        client.ping()
        logger.info("Rate limiting: используется Redis (%s)", url)
        return client
    except Exception as e:  # noqa: BLE001 — любая проблема = работаем без Redis
        logger.warning(
            "Redis недоступен (%s), rate limiting работает в памяти процесса. "
            "При нескольких воркерах лимиты будут мягче заявленных.", e
        )
        return None


_redis = _make_redis()


def redis_available() -> bool:
    return _redis is not None


# ---------------------------------------------------------------------------
# Лимитер по скользящему окну (письма, попытки ввода кода, AI-ассистент)
# ---------------------------------------------------------------------------

class SlidingWindowLimiter:
    """«Не больше N действий за окно» по произвольному ключу.

    В Redis хранится sorted set с метками времени: старые записи отбрасываются
    по времени, а не по TTL целого ключа, поэтому окно действительно скользящее.
    """

    def __init__(self, max_actions: int, window_seconds: int, prefix: str) -> None:
        self.max_actions = max_actions
        self.window_seconds = window_seconds
        self.prefix = prefix
        self._store: dict[str, list[float]] = {}
        self._lock = Lock()

    def _key(self, key: str | int) -> str:
        return f"rl:{self.prefix}:{key}"

    def check_allowed(self, key: str | int) -> tuple[bool, int]:
        """(allowed, seconds_until_reset)."""
        now = time.time()
        cutoff = now - self.window_seconds

        if _redis is not None:
            try:
                rk = self._key(key)
                pipe = _redis.pipeline()
                pipe.zremrangebyscore(rk, 0, cutoff)
                pipe.zrange(rk, 0, 0, withscores=True)
                pipe.zcard(rk)
                _, oldest, count = pipe.execute()
                if count >= self.max_actions:
                    oldest_ts = oldest[0][1] if oldest else now
                    return False, max(int(self.window_seconds - (now - oldest_ts)), 1)
                return True, 0
            except Exception as e:  # noqa: BLE001
                logger.warning("Redis ошибка в check_allowed, работаем в памяти: %s", e)

        with self._lock:
            history = [t for t in self._store.get(str(key), []) if t > cutoff]
            self._store[str(key)] = history
            if len(history) >= self.max_actions:
                return False, max(int(self.window_seconds - (now - history[0])), 1)
            return True, 0

    def record(self, key: str | int) -> None:
        now = time.time()
        cutoff = now - self.window_seconds

        if _redis is not None:
            try:
                rk = self._key(key)
                pipe = _redis.pipeline()
                pipe.zremrangebyscore(rk, 0, cutoff)
                pipe.zadd(rk, {f"{now}:{id(self)}": now})
                pipe.expire(rk, self.window_seconds + 60)
                pipe.execute()
                return
            except Exception as e:  # noqa: BLE001
                logger.warning("Redis ошибка в record, работаем в памяти: %s", e)

        with self._lock:
            history = [t for t in self._store.get(str(key), []) if t > cutoff]
            history.append(now)
            self._store[str(key)] = history

    def reset(self, key: str | int) -> None:
        if _redis is not None:
            try:
                _redis.delete(self._key(key))
                return
            except Exception as e:  # noqa: BLE001
                logger.warning("Redis ошибка в reset: %s", e)
        with self._lock:
            self._store.pop(str(key), None)


# Совместимость со старым кодом
ActionRateLimiter = SlidingWindowLimiter


# ---------------------------------------------------------------------------
# Лимитер логина: блокировка после N неудач
# ---------------------------------------------------------------------------

@dataclass
class _Entry:
    failed_attempts: int = 0
    locked_until: float = 0.0
    last_attempt: float = field(default_factory=time.time)


class LoginRateLimiter:
    """Считает неудачные попытки логина по IP и блокирует на время."""

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

    def _fail_key(self, ip: str) -> str:
        return f"rl:login:fail:{ip}"

    def _lock_key(self, ip: str) -> str:
        return f"rl:login:lock:{ip}"

    def check_allowed(self, ip: str) -> tuple[bool, int]:
        """(allowed, seconds_remaining). False — IP временно заблокирован."""
        if _redis is not None:
            try:
                ttl = _redis.ttl(self._lock_key(ip))
                if ttl and ttl > 0:
                    return False, ttl
                return True, 0
            except Exception as e:  # noqa: BLE001
                logger.warning("Redis ошибка в login check, работаем в памяти: %s", e)

        now = time.time()
        with self._lock:
            entry = self._store[ip]
            if now - entry.last_attempt > self.window_seconds:
                entry.failed_attempts = 0
                entry.locked_until = 0
            if entry.locked_until > now:
                return False, int(entry.locked_until - now)
            return True, 0

    def record_failure(self, ip: str) -> None:
        """Записать неудачную попытку. При превышении — заблокировать IP."""
        if _redis is not None:
            try:
                fk = self._fail_key(ip)
                pipe = _redis.pipeline()
                pipe.incr(fk)
                pipe.expire(fk, self.window_seconds)
                count, _ = pipe.execute()
                if int(count) >= self.max_attempts:
                    _redis.setex(self._lock_key(ip), self.lockout_seconds, "1")
                    _redis.delete(fk)
                return
            except Exception as e:  # noqa: BLE001
                logger.warning("Redis ошибка в record_failure, работаем в памяти: %s", e)

        now = time.time()
        with self._lock:
            entry = self._store[ip]
            entry.failed_attempts += 1
            entry.last_attempt = now
            if entry.failed_attempts >= self.max_attempts:
                entry.locked_until = now + self.lockout_seconds

    def record_success(self, ip: str) -> None:
        """Успешный логин — сбрасываем счётчик неудач."""
        if _redis is not None:
            try:
                _redis.delete(self._fail_key(ip), self._lock_key(ip))
                return
            except Exception as e:  # noqa: BLE001
                logger.warning("Redis ошибка в record_success: %s", e)

        with self._lock:
            self._store.pop(ip, None)


# ---------------------------------------------------------------------------
# Экземпляры
# ---------------------------------------------------------------------------

login_limiter = LoginRateLimiter()

# AI-ассистент: дорогие запросы к внешней модели, ограничиваем по пользователю.
assistant_limiter = SlidingWindowLimiter(
    max_actions=20, window_seconds=3600, prefix="assistant"
)

# Отправка писем с кодом: не чаще 3 раз за 15 минут на адрес/IP —
# иначе чужой почтовый ящик можно завалить письмами, а SMTP-счёт вырастет.
email_send_limiter = SlidingWindowLimiter(
    max_actions=3, window_seconds=900, prefix="email"
)

# Попытки ввода одноразового кода: 6-значный код перебирается за минуты,
# поэтому жёстко ограничиваем число проверок.
otp_attempt_limiter = SlidingWindowLimiter(
    max_actions=5, window_seconds=900, prefix="otp"
)
