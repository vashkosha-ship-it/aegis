"""Application configuration loaded from environment variables."""
from functools import lru_cache

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

    # Строка, а не List[str]: для сложных типов pydantic-settings пытается
    # разобрать значение как JSON ДО валидаторов, поэтому обычная строка через
    # запятую в .env роняла приложение на старте. Разбор — в cors_origins_list.
    CORS_ORIGINS: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        """Список разрешённых origin. Принимает и запятые, и JSON-массив."""
        raw = (self.CORS_ORIGINS or "").strip()
        if not raw:
            return []
        if raw.startswith("["):
            import json

            try:
                return [str(o).strip() for o in json.loads(raw) if str(o).strip()]
            except (ValueError, TypeError):
                return []
        return [o.strip() for o in raw.split(",") if o.strip()]

    # --- Rate limiting -------------------------------------------------------
    # Redis для общих счётчиков. Пусто — счётчики живут в памяти процесса
    # (годится для локальной разработки; в проде обязательно задать, иначе
    # при нескольких воркерах gunicorn лимиты умножаются на их число).
    REDIS_URL: str = ""
    # Локально очередь может быть выключена. Боевой systemd-unit принудительно
    # включает этот флаг: без индексации production считается неготовым.
    QUEUE_REQUIRED_FOR_READINESS: bool = False

    # --- Storage ------------------------------------------------------------
    STORAGE_BACKEND: str = "local"
    # Путь относительно рабочей директории, откуда запускается uvicorn (то есть backend/).
    STORAGE_LOCAL_PATH: str = "./storage"
    # Лимиты размеров. Меняй в .env, если книги тяжелее.
    # Лимит на файл книги. Меняется переменными окружения; вместе с ним надо
    # поднять client_max_body_size в nginx (deploy/nginx-aegis.conf).
    # Индексация для поиска берёт PDF до 500 МБ (search_index.MAX_PDF_BYTES).
    MAX_PDF_SIZE_MB: int = 500
    MAX_EPUB_SIZE_MB: int = 500
    MAX_COVER_SIZE_MB: int = 5

    # S3 / MinIO. S3_ENDPOINT_URL можно оставить пустым для AWS S3; для
    # совместимых провайдеров указывается полный https URL API.
    S3_ENDPOINT_URL: str = ""
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_BUCKET_BOOKS: str = "neon-books"
    S3_REGION: str = "us-east-1"
    # Префикс позволяет безопасно делить bucket с другими окружениями.
    S3_KEY_PREFIX: str = ""
    # MinIO и некоторые провайдеры требуют path-style адресацию.
    S3_FORCE_PATH_STYLE: bool = False
    S3_VERIFY_TLS: bool = True
    # Пусто — шифрование управляется политикой bucket. Для AWS обычно AES256.
    S3_SERVER_SIDE_ENCRYPTION: str = ""
    S3_CONNECT_TIMEOUT_SECONDS: int = 5
    S3_READ_TIMEOUT_SECONDS: int = 60

    # --- SMTP (отправка писем: подтверждение смены email) -------------------
    # Если SMTP_HOST пуст — отправка отключена, код смены пишется в лог (dev-режим).
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "Aegis <noreply@aegis.local>"
    SMTP_TLS: bool = True
    # Email администратора для уведомлений о новых заявках
    ADMIN_NOTIFY_EMAIL: str = ""
    # База для ссылок в письмах (фронт)
    FRONTEND_BASE_URL: str = "http://localhost:5173"

    # AI — пригодится на Этапе 3
    ANTHROPIC_API_KEY: str = ""

    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_MODEL: str = "deepseek-chat"
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"

    # --- Сбор ошибок (Sentry / GlitchTip) ----------------------------------
    # DSN проекта вида https://<key>@<host>/<project_id>. Пусто — ошибки только
    # пишутся в журнал. Сервер и браузерные ошибки уходят в один проект.
    ERROR_REPORTING_DSN: str = ""
    ERROR_REPORTING_ENVIRONMENT: str = "production"
    # Версия для группировки ошибок по выкладкам (например, git SHA).
    ERROR_REPORTING_RELEASE: str = ""

    # --- удобные derived-проперти -------------------------------------------
    @property
    def MAX_PDF_SIZE_BYTES(self) -> int:
        return self.MAX_PDF_SIZE_MB * 1024 * 1024

    @property
    def MAX_EPUB_SIZE_BYTES(self) -> int:
        return self.MAX_EPUB_SIZE_MB * 1024 * 1024

    @property
    def MAX_COVER_SIZE_BYTES(self) -> int:
        return self.MAX_COVER_SIZE_MB * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
