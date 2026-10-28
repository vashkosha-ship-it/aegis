"""Справочник подразделений: управления и отделы.

Отдел может входить в управление или быть самостоятельным. Управление
верхнего уровня, в другое управление не входит.

Сотрудник и руководитель связаны с подразделением через его КОД
(`users.department`, `users.managed_department`, `reading_assignments.department`) —
так было до справочника, и так старые данные не пришлось переносить. При смене
кода в справочнике он меняется и во всех этих местах.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.session import Base

KIND_DIRECTORATE = "directorate"  # управление
KIND_DEPARTMENT = "department"  # отдел
KINDS = (KIND_DIRECTORATE, KIND_DEPARTMENT)


class OrgUnit(Base):
    __tablename__ = "org_units"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default=KIND_DEPARTMENT)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("org_units.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
