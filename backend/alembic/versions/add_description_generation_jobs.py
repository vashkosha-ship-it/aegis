"""add persistent bulk description generation jobs

Revision ID: description_jobs
Revises: mylist_completed_at
"""

import sqlalchemy as sa
from alembic import op

revision = "description_jobs"
down_revision = "mylist_completed_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "description_generation_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("arq_job_id", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="queued", nullable=False),
        sa.Column("total_books", sa.Integer(), nullable=False),
        sa.Column("processed_books", sa.Integer(), nullable=False),
        sa.Column("succeeded_books", sa.Integer(), nullable=False),
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
            name="ck_description_generation_jobs_status",
        ),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_description_generation_jobs_status",
        "description_generation_jobs",
        ["status"],
    )
    op.create_index(
        "ix_description_generation_jobs_created_by_id",
        "description_generation_jobs",
        ["created_by_id"],
    )
    op.create_index(
        "ix_description_generation_jobs_created_at",
        "description_generation_jobs",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_description_generation_jobs_created_at",
        table_name="description_generation_jobs",
    )
    op.drop_index(
        "ix_description_generation_jobs_created_by_id",
        table_name="description_generation_jobs",
    )
    op.drop_index(
        "ix_description_generation_jobs_status",
        table_name="description_generation_jobs",
    )
    op.drop_table("description_generation_jobs")
