"""FastAPI application entrypoint."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.core.config import settings

from fastapi import FastAPI, Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Lifespan hook — connections are pooled lazily, nothing to do on startup yet."""
    yield


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

# CORS — фронт может быть на localhost или на актуальном Cloudflare-URL.
# При смене Cloudflare-туннеля обновляй ТОЛЬКО актуальный URL в списке.
_FRONTEND_ORIGINS = [
    "http://localhost:5173",
    "https://recommends-facts-heel-profiles.trycloudflare.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_FRONTEND_ORIGINS,
    allow_credentials=False,  # JWT в localStorage, cookies не нужны
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    max_age=600,  # кэшируем preflight-ответ на 10 минут (меньше OPTIONS-запросов)
)

app.include_router(api_router)

# --- Дополнительные роутеры (группы C и E) ---
# Подключаем напрямую, чтобы не зависеть от сборки api_router.
# Префикс /api — как у остального API (api_router его уже добавляет своим роутерам,
# поэтому здесь указываем явно).
from app.api.collections import router as collections_router  # noqa: E402
from app.api.chats import router as chats_router  # noqa: E402
from app.api.discussions import router as discussions_router  # noqa: E402
from app.api.search import router as search_router  # noqa: E402

app.include_router(collections_router, prefix="/api")
app.include_router(chats_router, prefix="/api")
app.include_router(discussions_router, prefix="/api")
app.include_router(search_router, prefix="/api")


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok", "app": settings.APP_NAME}