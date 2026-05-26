"""FastAPI application entrypoint."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.core.config import settings


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://recommends-facts-heel-profiles.trycloudflare.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok", "app": settings.APP_NAME}
