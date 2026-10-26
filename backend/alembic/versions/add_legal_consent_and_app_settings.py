"""legal consent fields and app settings

Revision ID: legal_consent_settings
Revises: avatar_preset

Только добавляет: три nullable-колонки в users и новую таблицу
app_settings. Существующие данные не меняются.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "legal_consent_settings"
down_revision: str | None = "avatar_preset"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("pd_consent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("legal_version", sa.String(32), nullable=True))
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", sa.JSON(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
    op.drop_column("users", "legal_version")
    op.drop_column("users", "pd_consent_at")
    op.drop_column("users", "terms_accepted_at")
