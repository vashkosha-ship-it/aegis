"""user_activity_events — журнал действий пользователя для админки

Revision ID: user_activity_events
Revises: book_metadata_reviewed
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "user_activity_events"
down_revision: str | None = "book_metadata_reviewed"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_activity_events",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.String(32), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("book_id", sa.Integer(), sa.ForeignKey("books.id", ondelete="SET NULL"), nullable=True),
        sa.Column("detail", sa.String(80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_user_activity_user_time", "user_activity_events", ["user_id", "created_at"])
    op.create_index("ix_user_activity_events_created_at", "user_activity_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_user_activity_events_created_at", table_name="user_activity_events")
    op.drop_index("ix_user_activity_user_time", table_name="user_activity_events")
    op.drop_table("user_activity_events")
