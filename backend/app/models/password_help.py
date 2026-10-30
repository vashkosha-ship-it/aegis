"""Заявка «помогите сменить пароль» — для тех, у кого нет доступа к почте."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class PasswordHelpRequest(Base):
    __tablename__ = "password_help_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Логин как его ввёл человек; user_id — если такой аккаунт нашёлся.
    username: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Как с человеком связаться, чтобы передать временный пароль.
    contact: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    resolved_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
