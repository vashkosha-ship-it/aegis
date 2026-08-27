"""Выдача и ротация токенов доступа.

Вынесено из роутера: логика обмена refresh-токена нетривиальна (одноразовость,
детект утечки, окно благодати) и не зависит от HTTP. Отдельный модуль позволяет
отзывать сессии из других мест — например, из админки — и тестировать ротацию
без поднятия приложения.
"""
from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User


@dataclass(slots=True)
class TokenPair:
    """Пара токенов для внутреннего использования.

    Раньше бралась из схем ответа. Наружу пара больше не отдаётся — refresh
    уходит только в cookie, — поэтому здесь нужен обычный контейнер, а не
    Pydantic-модель API.
    """
    access_token: str
    refresh_token: str

logger = logging.getLogger(__name__)

REFRESH_GRACE_SECONDS = 15
"""Окно, в течение которого повторный обмен тем же токеном не считается кражей.

Реальный сценарий: две вкладки одновременно заметили истёкший access-токен и
пошли обновляться. Без окна одна из них «украла бы» сессию у другой и
разлогинила пользователя.
"""


class TokenError(Exception):
    """Базовая ошибка работы с токенами."""


class InvalidToken(TokenError):
    """Токен не разобрался, не того типа или не найден."""


class TokenRevoked(TokenError):
    """Токен выпущен до смены пароля или выхода со всех устройств."""


class TokenExpired(TokenError):
    pass


class TokenReuseDetected(TokenError):
    """Refresh предъявлен повторно — значит копия у кого-то ещё."""


class UserInactive(TokenError):
    pass


def _aware(dt: datetime) -> datetime:
    """Привести время из БД к timezone-aware виду."""
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


async def issue_token_pair(db: AsyncSession, user: User) -> TokenPair:
    """Выдать access+refresh и зарегистрировать refresh в БД.

    jti нужен, чтобы отследить повторное использование: без записи в БД
    украденный refresh работал бы до самого истечения срока.
    """
    jti = secrets.token_urlsafe(32)
    db.add(
        RefreshToken(
            jti=jti,
            user_id=user.id,
            expires_at=datetime.now(UTC)
            + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    await db.commit()
    return TokenPair(
        access_token=create_access_token(
            user.id, user.role.value, token_version=user.token_version
        ),
        refresh_token=create_refresh_token(
            user.id, token_version=user.token_version, jti=jti
        ),
    )


async def revoke_all_sessions(db: AsyncSession, user: User) -> None:
    """Сделать недействительными все выданные пользователю токены."""
    user.token_version = (user.token_version or 0) + 1
    await db.commit()


async def rotate_refresh_token(db: AsyncSession, refresh_token: str) -> TokenPair:
    """Обменять refresh-токен на новую пару.

    Один токен — один обмен. Повторное предъявление означает, что копия
    оказалась у кого-то ещё, и все сессии пользователя отзываются.
    """
    try:
        decoded = decode_token(refresh_token)
        if decoded.get("type") != "refresh":
            raise InvalidToken("wrong token type")
        user_id = int(decoded["sub"])
    except (JWTError, KeyError, ValueError) as e:
        raise InvalidToken("cannot decode") from e

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise UserInactive(user_id)

    if int(decoded.get("tv", 0)) != user.token_version:
        raise TokenRevoked(user_id)

    jti = decoded.get("jti")
    if not jti:
        # Токен выпущен до внедрения ротации. Отследить его нельзя: нет записи
        # в БД, поэтому одноразовость и детект утечки на него не действуют —
        # украденная копия работала бы до самого истечения срока.
        # Отклоняем: пользователь просто войдёт заново.
        logger.info("Отклонён refresh старого формата (без jti), user=%s", user.id)
        raise InvalidToken("legacy token without jti")

    # FOR UPDATE: два параллельных обмена одним токеном иначе оба увидят
    # used_at = None и оба выдадут новые пары — одноразовость нарушается.
    record = await db.scalar(
        select(RefreshToken).where(RefreshToken.jti == jti).with_for_update()
    )
    if not record or record.user_id != user.id:
        raise InvalidToken("unknown jti")

    if datetime.now(UTC) > _aware(record.expires_at):
        raise TokenExpired(jti)

    if record.used_at is not None:
        age = (datetime.now(UTC) - _aware(record.used_at)).total_seconds()
        if age > REFRESH_GRACE_SECONDS:
            logger.warning(
                "Повторное использование refresh-токена (user=%s) — отзываем все сессии",
                user.id,
            )
            await revoke_all_sessions(db, user)
            raise TokenReuseDetected(user.id)

        # Окно благодати: две вкладки одновременно пошли обновляться. Отдаём
        # ту же пару, что выдали первой, а не плодим новые — иначе токен можно
        # прокручивать бесконечно, каждый раз попадая в окно.
        if record.replaced_by:
            logger.info("Повторный обмен в окне благодати, user=%s", user.id)
            successor = await db.scalar(
                select(RefreshToken).where(RefreshToken.jti == record.replaced_by)
            )
            if successor and successor.used_at is None:
                return TokenPair(
                    access_token=create_access_token(
                        user.id, user.role.value, token_version=user.token_version
                    ),
                    refresh_token=create_refresh_token(
                        user.id,
                        token_version=user.token_version,
                        jti=successor.jti,
                    ),
                )
        # Преемника нет или он уже потрачен — считаем это утечкой.
        await revoke_all_sessions(db, user)
        raise TokenReuseDetected(user.id)

    # Помечаем ДО выдачи новой пары: issue_token_pair делает commit, а он
    # снимает блокировку строки.
    new_jti = secrets.token_urlsafe(32)
    record.used_at = datetime.now(UTC)
    record.replaced_by = new_jti
    db.add(
        RefreshToken(
            jti=new_jti,
            user_id=user.id,
            expires_at=datetime.now(UTC)
            + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    await db.commit()

    return TokenPair(
        access_token=create_access_token(
            user.id, user.role.value, token_version=user.token_version
        ),
        refresh_token=create_refresh_token(
            user.id, token_version=user.token_version, jti=new_jti
        ),
    )

async def revoke_refresh_token(db: AsyncSession, refresh_token: str) -> bool:
    """Пометить refresh-токен использованным — например, при выходе.

    Возвращает True, если токен нашёлся и был отозван. Удаление cookie само
    по себе токен не аннулирует: значение остаётся действительным до
    истечения срока, и утёкшая копия продолжит работать.
    """
    try:
        decoded = decode_token(refresh_token)
        jti = decoded.get("jti")
    except JWTError:
        return False

    if not jti:
        return False

    record = await db.scalar(
        select(RefreshToken).where(RefreshToken.jti == jti).with_for_update()
    )
    if not record or record.used_at is not None:
        return False

    record.used_at = datetime.now(UTC)
    await db.commit()
    logger.info("Refresh-токен отозван при выходе (user=%s)", record.user_id)
    return True
