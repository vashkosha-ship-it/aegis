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

    # AI — пригодится на Этапе 3
    ANTHROPIC_API_KEY: str = ""

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
