"""Журнал действий пользователя в приложении (для админки → «Активность»).

Что записывается: начало сеанса (вход/открытие приложения, устройство),
открытые экраны, нажатые кнопки — по имени функции из кода, открытые
карточки книг и книги в читалке. То, что человек вводит сам (поиск,
заметки, сообщения, пароли), сюда не попадает.

Записи старше ACTIVITY_RETENTION_DAYS удаляются ежедневно.
"""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

ACTIVITY_RETENTION_DAYS = 90


class UserActivityEvent(Base):
    __tablename__ = "user_activity_events"
    __table_args__ = (Index("ix_user_activity_user_time", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Сеанс — одно открытие приложения (вкладки); id создаёт браузер.
    session_id: Mapped[str] = mapped_column(String(32), nullable=False)
    # session — начало сеанса; screen — экран; action — нажатие; book — книга.
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    book_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("books.id", ondelete="SET NULL"), nullable=True
    )
    # Устройство для начала сеанса: «Android · приложение», «Windows · Chrome».
    detail: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
