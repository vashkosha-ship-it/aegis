"""Обезличенная статистика использования интерфейса.

Хранятся только суммарные счётчики за день: «экран X открыли N раз»,
«действие Y выполнили M раз». Кто именно нажал — не записывается.
Выбор темы и цвета хранится в профиле пользователя (users.ui_theme,
users.ui_accent), а в админке показывается только распределение.
"""
from datetime import date

from sqlalchemy import Date, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class UsageCounter(Base):
    __tablename__ = "usage_counters"
    __table_args__ = (UniqueConstraint("day", "kind", "name", name="uq_usage_counter_day_kind_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    day: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # screen — открытие экрана, action — нажатие кнопки/функции.
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
