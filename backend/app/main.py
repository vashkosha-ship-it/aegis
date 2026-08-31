"""FastAPI application entrypoint."""
import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.api import api_router
from app.core.config import settings
from app.core.rate_limit import close_rate_limit, init_rate_limit

logger = logging.getLogger(__name__)

# Файл, которым проверяется возможность записи в хранилище. Создаётся и тут же
# удаляется при каждом обращении к /ready.
READINESS_PROBE_FILENAME = ".readiness-probe"

# Считать ли неработающую очередь поводом объявить сервис неготовым.
#
# False: без очереди не идёт индексация новых книг, но читать, проходить тесты
# и получать сертификаты можно. Снимать сервер с ротации из-за этого — значит
# променять работающий сайт на неработающий.
#
# Поставьте True, если индексация критична настолько, что сервер без неё
# бесполезен. Тогда /ready начнёт отдавать 503, и балансировщик выведет узел.
QUEUE_REQUIRED_FOR_READINESS = False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Проверяем зависимости до того, как начнём принимать запросы.

    Клиент Redis асинхронный и соединяется лениво, поэтому его недоступность
    сама собой больше не всплывает при старте. Без явной проверки приложение
    поднимется с неработающими лимитами, и выяснится это только на первом
    запросе — то есть уже на пользователе. В production init_rate_limit
    не даст запуститься вовсе.
    """
    await init_rate_limit()

    yield

    # Аккуратно закрываем пулы, чтобы не оставлять висящие соединения
    # к Redis при перезапуске.
    from app.core.queue import close_queue

    await close_queue()
    await close_rate_limit()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Backend for NEON STACK — cybersecurity reading platform.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Максимальный размер тела запроса — берём из настроек MAX_PDF_SIZE с запасом
_MAX_REQUEST_BODY_BYTES = settings.MAX_PDF_SIZE_BYTES + 5 * 1024 * 1024  # +5 МБ для overhead multipart

class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Отклоняем запросы с слишком большим телом ДО того, как они начнут писаться.
    
    Защита от DoS: атакующий не сможет залить 10 ГБ и забить диск/память,
    даже если внутренний save_stream правильно отвалится на лимите.
    """
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                size = int(content_length)
                if size > _MAX_REQUEST_BODY_BYTES:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": f"Request too large (max {_MAX_REQUEST_BODY_BYTES // (1024*1024)} MB)"},
                    )
            except ValueError:
                pass  # некорректный заголовок — пропускаем, разберёмся ниже
        return await call_next(request)


app.add_middleware(BodySizeLimitMiddleware)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Добавляем стандартные заголовки безопасности ко всем ответам."""
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=()"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# CORS — список разрешённых origin берём из настроек (переменная окружения
# CORS_ORIGINS, значения через запятую). Хардкод в коде означал, что смена
# домена требует правки исходников и деплоя.
_FRONTEND_ORIGINS = settings.cors_origins_list

if not _FRONTEND_ORIGINS:
    # Безопасный дефолт для локальной разработки. В проде обязательно задать
    # CORS_ORIGINS в .env, иначе фронт с боевого домена получит CORS-ошибку.
    _FRONTEND_ORIGINS = ["http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_FRONTEND_ORIGINS,
    # True обязательно: refresh-токен теперь в httpOnly-cookie, а браузер не
    # отправит её кросс-доменно без этого флага. Безопасно ровно потому, что
    # allow_origins — конкретный список, а не "*" (с "*" браузер и сам бы
    # запретил такую комбинацию).
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    # X-CSRF-Token нужен для double-submit проверки при обновлении токена
    # и выходе. X-Client-Type отсюда убран вместе с самой веткой: заголовок
    # позволял любому клиенту попросить refresh-токен в теле ответа, то есть
    # обойти httpOnly-cookie одной строкой.
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "X-CSRF-Token",
    ],
    max_age=600,  # кэшируем preflight-ответ на 10 минут (меньше OPTIONS-запросов)
)

# Все роутеры собраны в app/api/__init__.py — здесь одна точка подключения.
app.include_router(api_router)


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Проверка живости процесса.

    Отвечает мгновенно и ничего не проверяет — намеренно. Это ответ на вопрос
    «процесс не завис?», по которому systemd решает, перезапускать ли сервис.
    Если сюда добавить обращение к БД, то при её недоступности systemd начнёт
    бесконечно перезапускать здоровое приложение.
    """
    return {"status": "ok", "app": settings.APP_NAME}


async def _check_database() -> dict:
    """База: без неё не работает ничего."""
    from sqlalchemy import text

    from app.db.session import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        # Наружу отдаём только факт недоступности: текст ошибки SQLAlchemy
        # содержит хост, порт и имя базы, а /ready доступен без авторизации.
        logger.error("Readiness: база недоступна: %s", e)
        return {"ok": False}


async def _check_redis() -> dict:
    """Redis: rate limiting и очередь фоновых задач.

    Клиент берём через get_redis(), а не из переменной модуля: он привязан к
    event loop и пересоздаётся при смене цикла. Обращение к внутренней
    переменной давало закрытый клиент после первого же перезапуска lifespan,
    и проверка сообщала о недоступности исправного Redis.
    """
    from app.core import rate_limit

    if not rate_limit.redis_configured():
        # В production приложение без Redis не стартует, значит это dev-режим
        return {"ok": True, "note": "не настроен (режим разработки)"}

    client = rate_limit.get_redis()
    if client is None:
        return {"ok": False, "note": "клиент не создан"}

    try:
        await client.ping()
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        logger.error("Readiness: Redis недоступен: %s", e)
        return {"ok": False}


def _probe_storage_write(path: str) -> None:
    """Создать и удалить файл в каталоге хранилища.

    Синхронная функция — вызывается через to_thread, чтобы обращение к диску
    не останавливало event loop.
    """
    probe = os.path.join(path, READINESS_PROBE_FILENAME)
    with open(probe, "wb") as f:
        f.write(b"ok")
    os.unlink(probe)


async def _check_storage() -> dict:
    """Хранилище книг: проверяем запись, а не только чтение.

    os.access(path, os.R_OK) подтверждал, что каталог существует и читается.
    Но ломается хранилище обычно иначе: закончилось место, том перемонтировался
    в read-only после ошибки диска, права слетели при переносе. Во всех этих
    случаях прежняя проверка отвечала «готово», а загрузка книг падала.

    Пробный файл создаётся и удаляется на каждом обращении. Без fsync:
    гарантированно поймать переполнение диска он бы помог, но /ready
    опрашивают часто, и постоянная синхронизация с диском обошлась бы дороже
    той доли случаев, которую добавляет.
    """
    path = getattr(settings, "STORAGE_LOCAL_PATH", None)
    backend = getattr(settings, "STORAGE_BACKEND", "local")

    if backend != "local" or not path:
        return {"ok": True, "note": f"backend={backend}"}

    if not os.path.isdir(path):
        logger.error("Readiness: каталог хранилища отсутствует: %s", path)
        return {"ok": False, "note": "каталог отсутствует"}

    try:
        await asyncio.to_thread(_probe_storage_write, path)
        return {"ok": True}
    except OSError as e:
        logger.error("Readiness: в хранилище %s нельзя писать: %s", path, e)
        return {"ok": False, "note": "нет записи"}
    except Exception as e:  # noqa: BLE001
        logger.error("Readiness: ошибка проверки хранилища: %s", e)
        return {"ok": False}


async def _check_queue() -> dict:
    """Очередь фоновых задач: индексация книг.

    По умолчанию не влияет на общий вердикт — см. QUEUE_REQUIRED_FOR_READINESS.
    Но её состояние видно в ответе, и при неработающей очереди сервис помечен
    как работающий с ограничениями.
    """
    required = QUEUE_REQUIRED_FOR_READINESS
    try:
        from app.core.queue import get_queue

        queue = await get_queue()
        if queue is None:
            return {"ok": False, "required": required, "note": "не настроена"}

        # Наличие объекта ещё не значит, что соединение живое.
        ping = getattr(queue, "ping", None)
        if ping is not None:
            await ping()
        return {"ok": True, "required": required}
    except Exception as e:  # noqa: BLE001
        logger.error("Readiness: очередь недоступна: %s", e)
        return {"ok": False, "required": required}


async def _safe_check(name: str, check, *, required: bool = True) -> dict:
    """Выполнить проверку так, чтобы её собственная поломка не роняла /ready.

    Каждая проверка ловит свои ошибки сама, но полагаться на это нельзя:
    достаточно опечатки или изменившегося API библиотеки, и эндпоинт готовности
    начнёт отвечать пятисоткой. Это худший исход из возможных — мониторинг
    видит «сервис отвечает ошибкой» вместо внятного отчёта о том, что именно
    сломалось, а балансировщик не может отличить недоступность от неготовности.
    """
    try:
        return await check()
    except Exception:
        logger.exception("Readiness: проверка %s завершилась ошибкой", name)
        return {"ok": False, "required": required, "note": "проверка не выполнена"}


@app.get("/ready", tags=["health"])
async def ready(response: Response) -> dict:
    """Проверка готовности обслуживать запросы.

    В отличие от /health смотрит на зависимости: без базы, Redis или
    хранилища приложение запущено, но бесполезно. Раньше это выяснялось
    только по жалобам пользователей.

    Отдаёт 503, если недоступна обязательная часть. Необязательная (очередь)
    на код ответа не влияет, но переводит сервис в состояние degraded — иначе
    «работает, но книги не индексируются» выглядело бы полностью здоровым.
    """
    checks: dict[str, dict] = {
        "database": await _safe_check("database", _check_database),
        "redis": await _safe_check("redis", _check_redis),
        "storage": await _safe_check("storage", _check_storage),
        "queue": await _safe_check(
            "queue", _check_queue, required=QUEUE_REQUIRED_FOR_READINESS
        ),
    }

    required_ok = all(c["ok"] for c in checks.values() if c.get("required", True))
    degraded = [
        name for name, c in checks.items()
        if not c["ok"] and not c.get("required", True)
    ]

    if not required_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        state = "not ready"
    elif degraded:
        state = "degraded"
    else:
        state = "ready"

    result: dict = {"status": state, "checks": checks}
    if degraded:
        result["degraded"] = degraded
    return result
