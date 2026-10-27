"""book metadata cleanup jobs and change log

Revision ID: book_metadata_jobs
Revises: user_resume_hidden

Только добавляет две таблицы. Существующие данные не меняются.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "book_metadata_jobs"
down_revision: str | None = "user_resume_hidden"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "book_metadata_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("arq_job_id", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="queued", nullable=False),
        sa.Column("total_books", sa.Integer(), nullable=False),
        sa.Column("processed_books", sa.Integer(), nullable=False),
        sa.Column("changed_books", sa.Integer(), nullable=False),
        sa.Column("skipped_books", sa.Integer(), nullable=False),
        sa.Column("failed_books", sa.Integer(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_by_username", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'completed', 'failed')",
            name="ck_book_metadata_jobs_status",
        ),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_book_metadata_jobs_status", "book_metadata_jobs", ["status"])
    op.create_index("ix_book_metadata_jobs_created_by_id", "book_metadata_jobs", ["created_by_id"])
    op.create_index("ix_book_metadata_jobs_created_at", "book_metadata_jobs", ["created_at"])

    op.create_table(
        "book_metadata_changes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.String(length=36), nullable=True),
        sa.Column("book_id", sa.Integer(), nullable=False),
        sa.Column("old_title", sa.Text(), nullable=False),
        sa.Column("new_title", sa.Text(), nullable=False),
        sa.Column("old_author", sa.Text(), nullable=False),
        sa.Column("new_author", sa.Text(), nullable=False),
        sa.Column("old_categories", sa.JSON(), nullable=False),
        sa.Column("new_categories", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["job_id"], ["book_metadata_jobs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_book_metadata_changes_job_id", "book_metadata_changes", ["job_id"])
    op.create_index("ix_book_metadata_changes_book_id", "book_metadata_changes", ["book_id"])
    op.create_index("ix_book_metadata_changes_created_at", "book_metadata_changes", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_book_metadata_changes_created_at", table_name="book_metadata_changes")
    op.drop_index("ix_book_metadata_changes_book_id", table_name="book_metadata_changes")
    op.drop_index("ix_book_metadata_changes_job_id", table_name="book_metadata_changes")
    op.drop_table("book_metadata_changes")
    op.drop_index("ix_book_metadata_jobs_created_at", table_name="book_metadata_jobs")
    op.drop_index("ix_book_metadata_jobs_created_by_id", table_name="book_metadata_jobs")
    op.drop_index("ix_book_metadata_jobs_status", table_name="book_metadata_jobs")
    op.drop_table("book_metadata_jobs")
