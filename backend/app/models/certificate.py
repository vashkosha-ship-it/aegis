"""Сертификаты о прохождении аттестации по категории."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Certificate(Base):
    """Выданный сертификат: пользователь сдал тест по категории на >=85%."""
    __tablename__ = "certificates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(128), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)  # процент, 0-100
    full_name: Mapped[str] = mapped_column(String(128), nullable=False)  # ФИО на момент выдачи
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship()  # noqa: F821
