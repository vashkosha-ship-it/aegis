"""Массовая правка названий, авторов и тегов книг по их тексту (ИИ).

Каждое изменение записывается в book_metadata_changes со старыми
значениями: правку можно проверить и при необходимости откатить.
"""
from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.session import Base


class BookMetadataJob(Base):
    __tablename__ = "book_metadata_jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'running', 'completed', 'failed')",
            name="ck_book_metadata_jobs_status",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    arq_job_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="queued", server_default="queued", index=True
    )
    total_books: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_books: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    changed_books: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped_books: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_books: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by_username: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BookMetadataChange(Base):
    """Одна правка карточки: что было и что стало."""

    __tablename__ = "book_metadata_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[str | None] = mapped_column(
        ForeignKey("book_metadata_jobs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True
    )
    old_title: Mapped[str] = mapped_column(Text, nullable=False, default="")
    new_title: Mapped[str] = mapped_column(Text, nullable=False, default="")
    old_author: Mapped[str] = mapped_column(Text, nullable=False, default="")
    new_author: Mapped[str] = mapped_column(Text, nullable=False, default="")
    old_categories: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    new_categories: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
