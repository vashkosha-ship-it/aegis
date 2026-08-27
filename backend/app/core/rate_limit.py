"""Rate limiting: защита от брутфорса и спама.

Хранилище — Redis. В локальной разработке допустима память процесса.

Почему это важно: бэкенд работает под gunicorn с несколькими воркерами, и у
каждого своя память. При счётчиках в памяти лимит «5 попыток» превращается в
5×N попыток, а рестарт сервиса обнуляет блокировки. Redis делает счётчики
общими и переживает перезапуск.

Два свойства, ради которых модуль переписан.

Отказ вместо тихой деградации. Раньше сбой Redis в рантайме обрабатывался так
же, как его отсутствие при старте: операция ловила исключение, писала warning
и считала дальше в памяти. Для production это худший из вариантов — приложение
не падает и внешне работает, но защита от перебора исчезает, а единственный
след остаётся в логе, который никто не читает. Причём происходит это обычно
тогда же, когда защита нужнее всего. Теперь в production сбой Redis означает
503: лимитер, который не может посчитать попытки, не должен делать вид, что
посчитал.

Асинхронный клиент. Синхронный вызов внутри async-эндпоинта блокирует весь
event loop: пока один запрос ждёт ответа Redis, остальные не обрабатываются
вовсе. На здоровом localhost это доли миллисекунды и незаметно, но при
проблемах с сетью секундный socket_timeout превращается в секундную остановку
всего процесса — ровно в тот момент, когда очередь запросов и так растёт.

Память процесса (режим разработки) трогается без блокировок: весь код
исполняется в одном event loop, и между точками await состояние счётчиков не
меняется.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field

from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

# Сколько секунд не трогать Redis после сбоя. Без этого каждый запрос ждёт
# socket_timeout, и упавший Redis превращается в лавину таймаутов.
_CIRCUIT_OPEN_SECONDS = 5


# ---------------------------------------------------------------------------
# Подключение к Redis
# ---------------------------------------------------------------------------

class RedisRequiredError(RuntimeError):
    """В production Redis обязателен, а подключиться не удалось."""


def _is_production() -> bool:
    return not settings.DEBUG


def _make_redis():
    """Создать клиент. Соединение откроется лениво, при первой команде."""
    url = getattr(settings, "REDIS_URL", "") or ""

    if not url:
        if _is_production():
            raise RedisRequiredError(
                "REDIS_URL не задан. В production Redis обязателен: без него "
                "rate limiting работает в памяти каждого воркера отдельно, а "
                "фоновые задачи не выполняются. Укажите REDIS_URL в .env."
            )
        logger.warning(
            "REDIS_URL не задан — rate limiting работает в памяти процесса. "
            "Допустимо только для локальной разработки."
        )
        return None

    try:
        import redis.asyncio as aioredis
    except ImportError as e:
        if _is_production():
            raise RedisRequiredError(
                "Пакет redis не установлен, а в production он обязателен."
            ) from e
        logger.warning("Пакет redis не установлен — лимиты считаются в памяти")
        return None

    return aioredis.Redis.from_url(
        url,
        decode_responses=True,
        socket_timeout=1,
        socket_connect_timeout=1,
    )


_redis = _make_redis()

# До какого момента считать Redis нерабочим («предохранитель»).
_circuit_open_until = 0.0


async def init_rate_limit() -> None:
    """Проверить доступность Redis на старте приложения.

    Вызывать из lifespan в main.py. Смысл — в production не запускаться вовсе,
    если Redis недоступен: иначе приложение внешне работает, а защиты от
    перебора фактически нет.

    Асинхронный клиент соединяется лениво, поэтому раньше такая проверка
    происходила сама собой при создании клиента, а теперь её нужно делать явно.
    """
    if _redis is None:
        return
    try:
        await _redis.ping()
        logger.info("Rate limiting: используется Redis (%s)", settings.REDIS_URL)
    except Exception as e:
        if _is_production():
            raise RedisRequiredError(
                f"Redis недоступен по адресу {settings.REDIS_URL}: {e}. "
                "Проверьте, что сервис запущен: systemctl status redis-server"
            ) from e
        logger.warning(
            "Redis недоступен (%s), rate limiting работает в памяти процесса. "
            "При нескольких воркерах лимиты будут мягче заявленных.", e
        )


async def close_rate_limit() -> None:
    """Закрыть соединения при остановке приложения."""
    if _redis is not None:
        await _redis.aclose()


def redis_available() -> bool:
    return _redis is not None


def _use_redis() -> bool:
    """Стоит ли идти в Redis прямо сейчас."""
    return _redis is not None and time.time() >= _circuit_open_until


def _handle_redis_failure(operation: str, exc: Exception) -> None:
    """Реакция на сбой Redis во время работы.

    В production — отказ. Пропустить запрос означает открыть перебор, а
    сосчитать его в памяти воркера означает то же самое, только незаметно.

    В разработке возвращаем управление, и вызывающий код считает в памяти.
    """
    global _circuit_open_until
    _circuit_open_until = time.time() + _CIRCUIT_OPEN_SECONDS

    if _is_production():
        logger.error("Redis недоступен (%s): %s", operation, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Сервис временно недоступен, попробуйте через минуту",
        ) from exc

    logger.warning(
        "Redis ошибка в %s, считаем в памяти процесса: %s", operation, exc
    )


def _fail_closed(operation: str) -> None:
    """Предохранитель разомкнут — отказываем сразу, не ожидая таймаута."""
    if _is_production():
        logger.error("Redis признан нерабочим, отказываем в %s", operation)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Сервис временно недоступен, попробуйте через минуту",
        )


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

    def _key(self, key: str | int) -> str:
        return f"rl:{self.prefix}:{key}"

    async def check_allowed(self, key: str | int) -> tuple[bool, int]:
        """(allowed, seconds_until_reset)."""
        now = time.time()
        cutoff = now - self.window_seconds

        if _redis is not None:
            if not _use_redis():
                _fail_closed(f"{self.prefix}:check_allowed")
            else:
                try:
                    rk = self._key(key)
                    pipe = _redis.pipeline()
                    pipe.zremrangebyscore(rk, 0, cutoff)
                    pipe.zrange(rk, 0, 0, withscores=True)
                    pipe.zcard(rk)
                    _, oldest, count = await pipe.execute()
                    if count >= self.max_actions:
                        oldest_ts = oldest[0][1] if oldest else now
                        return False, max(
                            int(self.window_seconds - (now - oldest_ts)), 1
                        )
                    return True, 0
                except HTTPException:
                    raise
                except Exception as e:  # noqa: BLE001
                    _handle_redis_failure(f"{self.prefix}:check_allowed", e)

        history = [t for t in self._store.get(str(key), []) if t > cutoff]
        self._store[str(key)] = history
        if len(history) >= self.max_actions:
            return False, max(int(self.window_seconds - (now - history[0])), 1)
        return True, 0

    async def record(self, key: str | int) -> None:
        now = time.time()
        cutoff = now - self.window_seconds

        if _redis is not None:
            if not _use_redis():
                _fail_closed(f"{self.prefix}:record")
            else:
                try:
                    rk = self._key(key)
                    pipe = _redis.pipeline()
                    pipe.zremrangebyscore(rk, 0, cutoff)
                    pipe.zadd(rk, {f"{now}:{id(self)}": now})
                    pipe.expire(rk, self.window_seconds + 60)
                    await pipe.execute()
                    return
                except HTTPException:
                    raise
                except Exception as e:  # noqa: BLE001
                    _handle_redis_failure(f"{self.prefix}:record", e)

        history = [t for t in self._store.get(str(key), []) if t > cutoff]
        history.append(now)
        self._store[str(key)] = history

    async def reset(self, key: str | int) -> None:
        # Сброс счётчика ослабляет ограничение, а не усиливает: если Redis не
        # ответил, безопаснее оставить счётчик как есть, чем отказать
        # пользователю в успешном действии. Поэтому здесь без fail-closed.
        if _use_redis():
            try:
                await _redis.delete(self._key(key))
                return
            except Exception as e:  # noqa: BLE001
                logger.warning("Redis ошибка в reset (%s): %s", self.prefix, e)
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

    def _fail_key(self, ip: str) -> str:
        return f"rl:login:fail:{ip}"

    def _lock_key(self, ip: str) -> str:
        return f"rl:login:lock:{ip}"

    async def check_allowed(self, ip: str) -> tuple[bool, int]:
        """(allowed, seconds_remaining). False — IP временно заблокирован."""
        if _redis is not None:
            if not _use_redis():
                _fail_closed("login:check_allowed")
            else:
                try:
                    ttl = await _redis.ttl(self._lock_key(ip))
                    if ttl and ttl > 0:
                        return False, ttl
                    return True, 0
                except HTTPException:
                    raise
                except Exception as e:  # noqa: BLE001
                    _handle_redis_failure("login:check_allowed", e)

        now = time.time()
        entry = self._store[ip]
        if now - entry.last_attempt > self.window_seconds:
            entry.failed_attempts = 0
            entry.locked_until = 0
        if entry.locked_until > now:
            return False, int(entry.locked_until - now)
        return True, 0

    async def record_failure(self, ip: str) -> None:
        """Записать неудачную попытку. При превышении — заблокировать IP."""
        if _redis is not None:
            if not _use_redis():
                _fail_closed("login:record_failure")
            else:
                try:
                    fk = self._fail_key(ip)
                    pipe = _redis.pipeline()
                    pipe.incr(fk)
                    pipe.expire(fk, self.window_seconds)
                    count, _ = await pipe.execute()
                    if int(count) >= self.max_attempts:
                        await _redis.setex(
                            self._lock_key(ip), self.lockout_seconds, "1"
                        )
                        await _redis.delete(fk)
                    return
                except HTTPException:
                    raise
                except Exception as e:  # noqa: BLE001
                    _handle_redis_failure("login:record_failure", e)

        now = time.time()
        entry = self._store[ip]
        entry.failed_attempts += 1
        entry.last_attempt = now
        if entry.failed_attempts >= self.max_attempts:
            entry.locked_until = now + self.lockout_seconds

    async def record_success(self, ip: str) -> None:
        """Успешный логин — сбрасываем счётчик неудач.

        Как и reset выше: сброс только ослабляет ограничение, поэтому при
        недоступном Redis не отказываем — вход уже состоялся, наказывать
        пользователя за чужую поломку незачем.
        """
        if _use_redis():
            try:
                await _redis.delete(self._fail_key(ip), self._lock_key(ip))
                return
            except Exception as e:  # noqa: BLE001
                logger.warning("Redis ошибка в record_success: %s", e)

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
