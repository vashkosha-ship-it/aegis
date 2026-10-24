"""usage counters and UI preferences

Revision ID: usage_stats
Revises: backfill_reading_status
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "usage_stats"
down_revision: str | None = "backfill_reading_status"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "usage_counters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.UniqueConstraint("day", "kind", "name", name="uq_usage_counter_day_kind_name"),
    )
    op.create_index("ix_usage_counters_day", "usage_counters", ["day"])
    op.add_column("users", sa.Column("ui_theme", sa.String(8), nullable=True))
    op.add_column("users", sa.Column("ui_accent", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "ui_accent")
    op.drop_column("users", "ui_theme")
    op.drop_index("ix_usage_counters_day", table_name="usage_counters")
    op.drop_table("usage_counters")
