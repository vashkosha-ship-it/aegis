"""appearance onboarding flag

Revision ID: appearance_onboarded
Revises: usage_stats
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "appearance_onboarded"
down_revision: str | None = "usage_stats"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("appearance_onboarded", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Экран выбора оформления — только для первого входа. Те, кто уже
    # пользовался приложением до этой версии, его не увидят.
    op.execute("UPDATE users SET appearance_onboarded = true")


def downgrade() -> None:
    op.drop_column("users", "appearance_onboarded")
