"""Rate limiting: защита от брутфорса и спама.

Хранилище — Redis. В локальной разработке допустима память процесса.

Почему это важно: бэкенд работает под gunicorn с несколькими воркерами, и у
каждого своя память. При счётчиках в памяти лимит «5 попыток» превращается в
5×N попыток, а рестарт сервиса обнуляет блокировки. Redis делает счётчики
общими и переживает перезапуск.

Три свойства, ради которых модуль выглядит так, а не проще.

Отказ вместо тихой деградации. Сбой Redis в рантайме раньше перехватывался и
работа продолжалась со счётчиками в памяти процесса. Для production это худший
вариант: приложение внешне работает, но защита от перебора исчезает, а
единственный след остаётся в логе. Теперь в production сбой означает 503.

Асинхронный клиент. Синхронный вызов внутри async-эндпоинта блокирует весь
event loop: при проблемах с сетью секундный таймаут останавливает весь процесс.

Клиент живёт ровно столько, сколько event loop, который его создал. Это не
украшение, а следствие болезненной ошибки: клиент создавался один раз при
импорте модуля и закрывался в lifespan через aclose(). После первого же
завершения жизненного цикла глобальная переменная указывала на закрытый
клиент, привязанный к несуществующему циклу, и КАЖДЫЙ следующий запрос падал.
Причём падал в 503 — из-за той самой политики «не можем посчитать, значит не
пропускаем». Осторожное поведение усилило поломку вместо того, чтобы её
смягчить. Теперь клиент создаётся лениво и пересоздаётся, если цикл сменился.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid

from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

# Сколько секунд не трогать Redis после сбоя. Без этого каждый запрос ждёт
# socket_timeout, и упавший Redis превращается в лавину таймаутов.
_CIRCUIT_OPEN_SECONDS = 5


class RedisRequiredError(RuntimeError):
    """В production Redis обязателен, а подключиться не удалось."""


def _is_production() -> bool:
    return not settings.DEBUG


def redis_url() -> str:
    return getattr(settings, "REDIS_URL", "") or ""


def redis_configured() -> bool:
    """Настроен ли Redis. Не создаёт клиента и не требует event loop."""
    return bool(redis_url())


# ---------------------------------------------------------------------------
# Клиент, привязанный к текущему event loop
# ---------------------------------------------------------------------------

_client = None
_client_loop: asyncio.AbstractEventLoop | None = None

# До какого момента считать Redis нерабочим («предохранитель»).
_circuit_open_until = 0.0


def _current_loop() -> asyncio.AbstractEventLoop | None:
    try:
        return asyncio.get_running_loop()
    except RuntimeError:
        return None


def _build_client():
    """Создать клиент. Соединение откроется лениво, при первой команде."""
    url = redis_url()
    if not url:
        return None

    try:
        import redis.asyncio as aioredis
    except ImportError:
        if _is_production():
            raise RedisRequiredError(
                "Пакет redis не установлен, а в production он обязателен."
            ) from None
        logger.warning("Пакет redis не установлен — лимиты считаются в памяти")
        return None

    return aioredis.Redis.from_url(
        url,
        decode_responses=True,
        socket_timeout=1,
        socket_connect_timeout=1,
    )


def get_redis():
    """Клиент для текущего event loop. None, если Redis не настроен.

    Пересоздаёт клиент, если цикл сменился. Соединения asyncio привязаны к
    циклу, в котором открыты: попытка использовать их из другого цикла даёт
    невнятные ошибки вроде «Event loop is closed» — или, что хуже, зависание.

    Смена цикла случается не только в тестах. Достаточно перезапуска воркера
    gunicorn или повторного входа в lifespan.
    """
    global _client, _client_loop

    if not redis_configured():
        return None

    loop = _current_loop()
    if _client is not None and _client_loop is loop:
        return _client

    if _client is not None:
        # Клиент от предыдущего цикла. Закрывать его отсюда нельзя — цикла,
        # которому он принадлежит, уже нет. Просто отпускаем: соединения
        # закроются вместе с ним.
        logger.info("Event loop сменился — создаём новый клиент Redis")

    _client = _build_client()
    _client_loop = loop
    return _client


async def init_rate_limit() -> None:
    """Проверить доступность Redis на старте приложения.

    Вызывать из lifespan в main.py. Смысл — в production не запускаться, если
    Redis недоступен: иначе приложение внешне работает, а защиты от перебора
    фактически нет.

    Здесь же сбрасывается предохранитель: новый жизненный цикл не должен
    начинаться с памятью о сбоях предыдущего.
    """
    reset_circuit()

    if not redis_configured():
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
        return

    client = get_redis()
    if client is None:
        return

    try:
        await client.ping()
        logger.info("Rate limiting: используется Redis (%s)", redis_url())
    except Exception as e:
        if _is_production():
            raise RedisRequiredError(
                f"Redis недоступен по адресу {redis_url()}: {e}. "
                "Проверьте, что сервис запущен: systemctl status redis-server"
            ) from e
        logger.warning(
            "Redis недоступен (%s), rate limiting работает в памяти процесса. "
            "При нескольких воркерах лимиты будут мягче заявленных.", e
        )


async def close_rate_limit() -> None:
    """Закрыть соединения при остановке приложения.

    Обязательно обнуляем ссылку: иначе следующий жизненный цикл получил бы
    закрытый клиент и все запросы завершались бы отказом.
    """
    global _client, _client_loop

    client = _client
    _client = None
    _client_loop = None
    reset_circuit()

    if client is not None:
        try:
            await client.aclose()
        except Exception as e:  # noqa: BLE001
            logger.warning("Не удалось закрыть клиент Redis: %s", e)


def reset_circuit() -> None:
    """Снова разрешить обращения к Redis."""
    global _circuit_open_until
    _circuit_open_until = 0.0


def redis_available() -> bool:
    """Настроен ли Redis. Намеренно не требует запущенного event loop —
    вызывается в том числе из проверок готовности."""
    return redis_configured()


def _use_redis() -> bool:
    """Стоит ли идти в Redis прямо сейчас."""
    return redis_configured() and time.time() >= _circuit_open_until


def _handle_redis_failure(operation: str, exc: Exception) -> None:
    """Реакция на сбой Redis во время работы.

    В production — отказ. Пропустить запрос означает открыть перебор, а
    сосчитать его в памяти воркера означает то же самое, только незаметно.
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

# Проверка и запись одной операцией на стороне Redis.
#
# Раньше это были два вызова: сначала check_allowed, потом record. Между ними
# проходило время, и десять параллельных запросов успевали пройти проверку до
# того, как хоть один записался. Лимит «3 письма за 15 минут» обходился
# отправкой десяти писем одновременно — а именно так перебор и делают.
#
# Lua-скрипт Redis выполняет целиком, без чередования с другими командами.
_SLIDING_WINDOW_LUA = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local cutoff = tonumber(ARGV[2])
local max_actions = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local member = ARGV[5]

redis.call('ZREMRANGEBYSCORE', key, 0, cutoff)
local count = redis.call('ZCARD', key)

if count >= max_actions then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldest_ts = now
  if oldest[2] then oldest_ts = tonumber(oldest[2]) end
  return {0, tostring(oldest_ts)}
end

redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, ttl)
return {1, '0'}
"""


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

    @staticmethod
    def _member(now: float) -> str:
        # uuid, а не время с id(self): совпадение по времени в пределах
        # разрешения таймера затирало чужую запись в sorted set, и попытка
        # просто не считалась. id(self) от этого не спасал — он одинаков для
        # всех обращений к одному лимитеру, а после сборки мусора может
        # повториться у другого объекта.
        return f"{now}:{uuid.uuid4().hex}"

    async def try_acquire(self, key: str | int) -> tuple[bool, int]:
        """Проверить и сразу засчитать попытку. (allowed, seconds_until_reset).

        Одна атомарная операция вместо связки «проверил — записал»: между ними
        параллельные запросы успевали проскочить все разом.
        """
        now = time.time()
        cutoff = now - self.window_seconds
        client = get_redis()

        if client is not None:
            if not _use_redis():
                _fail_closed(f"{self.prefix}:try_acquire")
            else:
                try:
                    allowed, oldest = await client.eval(
                        _SLIDING_WINDOW_LUA,
                        1,
                        self._key(key),
                        str(now),
                        str(cutoff),
                        str(self.max_actions),
                        str(self.window_seconds + 60),
                        self._member(now),
                    )
                    if int(allowed) == 1:
                        return True, 0
                    oldest_ts = float(oldest)
                    return False, max(
                        int(self.window_seconds - (now - oldest_ts)), 1
                    )
                except HTTPException:
                    raise
                except Exception as e:  # noqa: BLE001
                    _handle_redis_failure(f"{self.prefix}:try_acquire", e)

        history = [t for t in self._store.get(str(key), []) if t > cutoff]
        if len(history) >= self.max_actions:
            self._store[str(key)] = history
            return False, max(int(self.window_seconds - (now - history[0])), 1)
        history.append(now)
        self._store[str(key)] = history
        return True, 0

    async def check_allowed(self, key: str | int) -> tuple[bool, int]:
        """Только проверить, не засчитывая.

        Оставлено для мест, где решение о попытке принимается позже. Помните,
        что между этой проверкой и записью остаётся окно, в которое проходят
        параллельные запросы: где можно, используйте try_acquire.
        """
        now = time.time()
        cutoff = now - self.window_seconds
        client = get_redis()

        if client is not None:
            if not _use_redis():
                _fail_closed(f"{self.prefix}:check_allowed")
            else:
                try:
                    rk = self._key(key)
                    pipe = client.pipeline()
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
        """Засчитать попытку без проверки."""
        now = time.time()
        cutoff = now - self.window_seconds
        client = get_redis()

        if client is not None:
            if not _use_redis():
                _fail_closed(f"{self.prefix}:record")
            else:
                try:
                    rk = self._key(key)
                    pipe = client.pipeline()
                    pipe.zremrangebyscore(rk, 0, cutoff)
                    pipe.zadd(rk, {self._member(now): now})
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
        client = get_redis()
        if client is not None and _use_redis():
            try:
                await client.delete(self._key(key))
                return
            except Exception as e:  # noqa: BLE001
                logger.warning("Redis ошибка в reset (%s): %s", self.prefix, e)
        self._store.pop(str(key), None)


# Совместимость со старым кодом
ActionRateLimiter = SlidingWindowLimiter


# ---------------------------------------------------------------------------
# Лимитер логина: блокировка после N неудач
# ---------------------------------------------------------------------------

# Проверка блокировки и учёт попытки — одной операцией.
#
# Раньше check_allowed только смотрел, не заблокирован ли адрес, а счётчик рос
# лишь при неудаче. Сотня одновременных запросов с неверным паролем проходила
# проверку целиком: ни один ещё не успел записаться. Атакующий получал сотню
# попыток вместо пяти, и блокировка срабатывала уже после.
#
# Теперь считается КАЖДАЯ попытка, а успешный вход счётчик обнуляет. Плата за
# это — офис за одним адресом с пятью неудачными входами подряд заблокируется
# целиком; выбор в пользу защиты сделан сознательно.
_LOGIN_ATTEMPT_LUA = """
local lock_key = KEYS[1]
local fail_key = KEYS[2]
local max_attempts = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local lockout = tonumber(ARGV[3])

local ttl = redis.call('TTL', lock_key)
if ttl and ttl > 0 then
  return {0, tostring(ttl)}
end

local attempts = redis.call('INCR', fail_key)
if attempts == 1 then
  redis.call('EXPIRE', fail_key, window)
end

if attempts > max_attempts then
  redis.call('SET', lock_key, '1', 'EX', lockout)
  redis.call('DEL', fail_key)
  return {0, tostring(lockout)}
end

return {1, '0'}
"""


class _Entry:
    """Состояние адреса в памяти процесса (режим разработки)."""

    __slots__ = ("attempts", "last_attempt", "locked_until")

    def __init__(self) -> None:
        self.attempts = 0
        self.locked_until = 0.0
        self.last_attempt = time.time()


class LoginRateLimiter:
    """Считает попытки входа по IP и блокирует адрес после превышения."""

    def __init__(
        self,
        max_attempts: int = 5,
        lockout_seconds: int = 300,     # 5 минут блокировка
        window_seconds: int = 900,      # сброс счётчика через 15 минут бездействия
    ) -> None:
        self.max_attempts = max_attempts
        self.lockout_seconds = lockout_seconds
        self.window_seconds = window_seconds
        self._store: dict[str, _Entry] = {}

    def _fail_key(self, ip: str) -> str:
        return f"rl:login:fail:{ip}"

    def _lock_key(self, ip: str) -> str:
        return f"rl:login:lock:{ip}"

    async def check_allowed(self, ip: str) -> tuple[bool, int]:
        """Проверить и сразу засчитать попытку. (allowed, seconds_remaining).

        Название сохранено ради вызывающего кода, но операция теперь не только
        проверяет: иначе параллельные запросы проходили проверку все разом.
        """
        client = get_redis()

        if client is not None:
            if not _use_redis():
                _fail_closed("login:check_allowed")
            else:
                try:
                    allowed, wait = await client.eval(
                        _LOGIN_ATTEMPT_LUA,
                        2,
                        self._lock_key(ip),
                        self._fail_key(ip),
                        str(self.max_attempts),
                        str(self.window_seconds),
                        str(self.lockout_seconds),
                    )
                    return bool(int(allowed)), int(float(wait))
                except HTTPException:
                    raise
                except Exception as e:  # noqa: BLE001
                    _handle_redis_failure("login:check_allowed", e)

        now = time.time()
        entry = self._store.setdefault(ip, _Entry())
        if now - entry.last_attempt > self.window_seconds:
            entry.attempts = 0
            entry.locked_until = 0.0
        if entry.locked_until > now:
            return False, int(entry.locked_until - now)

        entry.attempts += 1
        entry.last_attempt = now
        if entry.attempts > self.max_attempts:
            entry.locked_until = now + self.lockout_seconds
            entry.attempts = 0
            return False, self.lockout_seconds
        return True, 0

    async def record_failure(self, ip: str) -> None:
        """Оставлено для совместимости с вызывающим кодом.

        Попытка уже засчитана в check_allowed — считать её второй раз значит
        вдвое ужесточить лимит. Метод ничего не делает намеренно: убирать
        вызовы из auth.py в одной правке с изменением лимитера рискованно.
        """
        return

    async def record_success(self, ip: str) -> None:
        """Успешный вход обнуляет счётчик попыток.

        Как и reset: сброс только ослабляет ограничение, поэтому при
        недоступном Redis не отказываем — вход уже состоялся.
        """
        client = get_redis()
        if client is not None and _use_redis():
            try:
                await client.delete(self._fail_key(ip), self._lock_key(ip))
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
