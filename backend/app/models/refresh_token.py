"""Учёт выданных refresh-токенов.

Зачем: JWT сам по себе нельзя «отозвать» — он действителен, пока не истечёт.
Раньше один и тот же refresh-токен можно было предъявлять сколько угодно раз
в течение двух недель, и укравший его получал бессрочный доступ.

Теперь каждый refresh одноразовый: при обмене он помечается использованным и
выдаётся новый. Если предъявлен уже использованный токен — значит копия
оказалась у кого-то ещё, и все сессии пользователя отзываются.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.session import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # jti из JWT — по нему находим запись
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Момент обмена. Непусто = токен уже потрачен.
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # jti токена, выданного взамен — помогает разобрать цепочку при инциденте
    replaced_by: Mapped[str | None] = mapped_column(String(64), nullable=True)

    def __repr__(self) -> str:
        state = "used" if self.used_at else "active"
        return f"<RefreshToken user={self.user_id} {state}>"
