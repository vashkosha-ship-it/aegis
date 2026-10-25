"""avatar presets

Revision ID: avatar_preset
Revises: appearance_onboarded
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "avatar_preset"
down_revision: str | None = "appearance_onboarded"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_preset", sa.String(8), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_preset")
