"""FastAPI application entrypoint."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.api import api_router
from app.core.config import settings
from app.core.rate_limit import close_rate_limit, init_rate_limit

logger = logging.getLogger(__name__)


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


@app.get("/ready", tags=["health"])
async def ready(response: Response) -> dict:
    """Проверка готовности обслуживать запросы.

    В отличие от /health смотрит на зависимости: без базы, Redis или
    хранилища приложение запущено, но бесполезно. Раньше это выяснялось
    только по жалобам пользователей.

    Отдаёт 503, если хоть одна обязательная часть недоступна.
    """
    from sqlalchemy import text

    from app.core import rate_limit
    from app.db.session import AsyncSessionLocal

    checks: dict[str, dict] = {}

    # --- База данных: без неё не работает ничего ---------------------------
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        checks["database"] = {"ok": True}
    except Exception as e:  # noqa: BLE001
        # Наружу отдаём только факт недоступности: текст ошибки SQLAlchemy
        # содержит хост, порт и имя базы, а /ready доступен без авторизации.
        logger.error("Readiness: база недоступна: %s", e)
        checks["database"] = {"ok": False}

    # --- Redis: rate limiting и очередь фоновых задач ----------------------
    if rate_limit._redis is None:
        # В production приложение без Redis не стартует, значит это dev-режим
        checks["redis"] = {"ok": True, "note": "не настроен (режим разработки)"}
    else:
        try:
            await rate_limit._redis.ping()
            checks["redis"] = {"ok": True}
        except Exception as e:  # noqa: BLE001
            logger.error("Readiness: Redis недоступен: %s", e)
            checks["redis"] = {"ok": False}

    # --- Хранилище книг ----------------------------------------------------
    try:
        import os

        path = getattr(settings, "STORAGE_LOCAL_PATH", None)
        backend = getattr(settings, "STORAGE_BACKEND", "local")
        if backend == "local" and path:
            if os.path.isdir(path) and os.access(path, os.R_OK):
                checks["storage"] = {"ok": True}
            else:
                logger.error("Readiness: нет доступа к хранилищу %s", path)
                checks["storage"] = {"ok": False}
        else:
            checks["storage"] = {"ok": True, "note": f"backend={backend}"}
    except Exception as e:  # noqa: BLE001
        logger.error("Readiness: ошибка проверки хранилища: %s", e)
        checks["storage"] = {"ok": False}

    # --- Очередь фоновых задач --------------------------------------------
    # Не обязательна для работы сайта: без неё не пойдёт индексация книг,
    # но читать и проходить тесты можно. Поэтому в общий вердикт не входит.
    try:
        from app.core.queue import get_queue

        queue = await get_queue()
        checks["queue"] = {"ok": queue is not None, "required": False}
    except Exception as e:  # noqa: BLE001
        logger.error("Readiness: очередь недоступна: %s", e)
        checks["queue"] = {"ok": False, "required": False}

    required_ok = all(
        c["ok"] for c in checks.values() if c.get("required", True)
    )
    if not required_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if required_ok else "not ready",
        "checks": checks,
    }