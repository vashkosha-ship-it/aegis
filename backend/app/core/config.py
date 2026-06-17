"""Application configuration loaded from environment variables."""
from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    APP_NAME: str = "NEON STACK"
    DEBUG: bool = False

    DATABASE_URL: str
    DATABASE_URL_SYNC: str

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    CORS_ORIGINS: List[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    # --- Storage (Этап 2) ----------------------------------------------------
    # На Этапе 2 — "local". На Этапе 4 переключим на "s3".
    STORAGE_BACKEND: str = "local"
    # Путь относительно рабочей директории, откуда запускается uvicorn (то есть backend/).
    STORAGE_LOCAL_PATH: str = "./storage"
    # Лимиты размеров. Меняй в .env, если книги тяжелее.
    MAX_PDF_SIZE_MB: int = 150
    MAX_COVER_SIZE_MB: int = 5

    # S3 / MinIO — пригодятся на Этапе 4
    S3_ENDPOINT_URL: str = ""
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_BUCKET_BOOKS: str = "neon-books"
    S3_REGION: str = "us-east-1"

    # --- SMTP (отправка писем: подтверждение смены email) -------------------
    # Если SMTP_HOST пуст — отправка отключена, код смены пишется в лог (dev-режим).
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "Aegis <noreply@aegis.local>"
    SMTP_TLS: bool = True
    # Email администратора для уведомлений о новых заявках
    ADMIN_NOTIFY_EMAIL: str = "vash.kosha@gmail.com"
    # База для ссылок в письмах (фронт)
    FRONTEND_BASE_URL: str = "http://localhost:5173"

    # AI — пригодится на Этапе 3
    ANTHROPIC_API_KEY: str = ""

    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_MODEL: str = "deepseek-chat"
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"

    # --- удобные derived-проперти -------------------------------------------
    @property
    def MAX_PDF_SIZE_BYTES(self) -> int:
        return self.MAX_PDF_SIZE_MB * 1024 * 1024

    @property
    def MAX_COVER_SIZE_BYTES(self) -> int:
        return self.MAX_COVER_SIZE_MB * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()