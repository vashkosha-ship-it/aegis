"""Persistent status of bulk AI description generation."""
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.session import Base


class DescriptionGenerationJob(Base):
    __tablename__ = "description_generation_jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'running', 'completed', 'failed')",
            name="ck_description_generation_jobs_status",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    arq_job_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="queued", server_default="queued", index=True
    )
    total_books: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_books: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    succeeded_books: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_books: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by_username: Mapped[str] = mapped_column(
        String(64), nullable=False, default=""
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
