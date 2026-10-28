"""Назначенное чтение: руководитель отдела назначает книгу своему отделу.

Отдел — это значение `users.department` (ЦВВ, УЭК…). Руководителем отдела
пользователя делает администратор, заполняя `users.managed_department`;
своё подразделение сотрудник может менять сам, а отдел, которым он руководит, —
нет. Иначе любой читатель мог бы «стать» руководителем чужого отдела и видеть
прогресс его сотрудников.
"""
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class ReadingAssignment(Base):
    __tablename__ = "reading_assignments"
    __table_args__ = (
        UniqueConstraint("department", "book_id", name="uq_reading_assignment_department_book"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    department: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Кто назначил. Удаление руководителя назначение не удаляет.
    assigned_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    book: Mapped["Book"] = relationship(lazy="joined")  # noqa: F821
    assigned_by: Mapped["User | None"] = relationship(lazy="joined")  # noqa: F821
