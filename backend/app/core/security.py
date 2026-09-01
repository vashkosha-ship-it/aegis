"""Хеширование паролей (bcrypt) и работа с JWT.

Про выбор библиотеки для JWT. Раньше здесь была python-jose. Она не
обновлялась с 2021 года и имеет известные проблемы — путаницу алгоритмов и
отказ в обслуживании через JWE с высокой степенью сжатия. Вместе с ней в
зависимости приходила ecdsa, где уязвимость к атаке по времени объявлена
неустранимой: авторы прямо пишут, что чистый Python не позволяет обеспечить
постоянное время выполнения, и чинить это не планируют.

Мы используем только HS256, то есть ecdsa нам не нужна вовсе — она приезжала
за компанию. PyJWT поддерживается, делает ровно то, что требуется, и тянет за
собой только cryptography.

Интерфейс модуля не изменился: create_access_token, create_refresh_token и
decode_token принимают и возвращают то же самое.
"""
import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from jwt import PyJWTError
from passlib.context import CryptContext

from app.core.config import settings

# bcrypt с rounds=12 — золотая середина: безопасно и не слишком медленно
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


class TokenError(Exception):
    """Токен недействителен, просрочен или подделан.

    Своё исключение, а не библиотечное: вызывающему коду не нужно знать, какой
    библиотекой разобран токен. Прошлый переезд показал, зачем это: `except
    JWTError` был раскидан по модулям и привязывал их к python-jose.
    """


# Прежнее имя оставлено, чтобы не переписывать все обработчики разом.
JWTError = TokenError


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
    now = datetime.now(UTC)
    expire = now + timedelta(
        minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload: dict[str, Any] = {
        "sub": str(subject),
        "role": role,
        "type": "access",
        "tv": token_version,
        "exp": expire,
        "iat": now,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(
    subject: str | int, token_version: int = 0, jti: str | None = None
) -> str:
    """Create a long-lived JWT refresh token.

    jti — идентификатор конкретного токена. По нему сервер отслеживает, был ли
    токен уже обменян: повторное предъявление означает утечку.
    """
    now = datetime.now(UTC)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": "refresh",
        "tv": token_version,
        "exp": expire,
        "iat": now,
    }
    if jti:
        payload["jti"] = jti
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """Разобрать токен и вернуть содержимое. Бросает TokenError, если он плох.

    Список алгоритмов задан явно и состоит из одного элемента. Это главная
    защита от подмены алгоритма: без него подписанный чем угодно токен —
    включая alg=none — мог бы пройти проверку.

    require заставляет отвергать токены без exp, iat и sub. Токен без срока
    жизни действует вечно, а без sub непонятно, кому он выдан.
    """
    try:
        return jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={
                "require": ["exp", "iat", "sub"],
                "verify_exp": True,
                "verify_signature": True,
            },
        )
    except PyJWTError as exc:
        raise TokenError(f"Invalid token: {exc}") from exc


# ============================================================================
# Одноразовые коды (подтверждение email, сброс пароля, смена email)
# ============================================================================
# 6-значный код имеет всего миллион вариантов, поэтому bcrypt-хеш от него
# подбирается перебором за минуты. Используем HMAC-SHA256 с серверным
# секретом: без SECRET_KEY перебор по дампу БД невозможен.


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
