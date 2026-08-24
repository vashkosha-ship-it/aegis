"""Password hashing (bcrypt) and JWT token utilities."""
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# bcrypt с rounds=12 — золотая середина: безопасно и не слишком медленно
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(plain_password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    subject: str | int,
    role: str,
    expires_minutes: int | None = None,
    token_version: int = 0,
) -> str:
    """Create a short-lived JWT access token.

    token_version попадает в claim "tv" и сверяется при каждом запросе:
    инкремент версии у пользователя мгновенно отзывает все выданные токены.
    """
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload: dict[str, Any] = {
        "sub": str(subject),
        "role": role,
        "type": "access",
        "tv": token_version,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(
    subject: str | int, token_version: int = 0, jti: str | None = None
) -> str:
    """Create a long-lived JWT refresh token.

    jti — идентификатор конкретного токена. По нему сервер отслеживает, был ли
    токен уже обменян: повторное предъявление означает утечку.
    """
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": "refresh",
        "tv": token_version,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    if jti:
        payload["jti"] = jti
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """Decode a JWT and return its payload. Raises JWTError on invalid/expired tokens."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError as exc:
        raise JWTError(f"Invalid token: {exc}") from exc


# ============================================================================
# Одноразовые коды (подтверждение email, сброс пароля, смена email)
# ============================================================================
# 6-значный код имеет всего миллион вариантов, поэтому bcrypt-хеш от него
# подбирается перебором за минуты. Используем HMAC-SHA256 с серверным
# секретом: без SECRET_KEY перебор по дампу БД невозможен.

import hmac
import hashlib


def hash_otp(code: str) -> str:
    """HMAC-SHA256 от одноразового кода. Хранить в БД только результат."""
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        code.strip().encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verify_otp(code: str, stored: str | None) -> bool:
    """Сравнить код с сохранённым хешем в постоянное время."""
    if not stored:
        return False
    return hmac.compare_digest(hash_otp(code), stored)
