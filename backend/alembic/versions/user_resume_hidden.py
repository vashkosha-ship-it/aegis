"""users.resume_hidden: books hidden from the Continue block

Revision ID: user_resume_hidden
Revises: default_accent_blue

Только добавляет nullable-колонку. Список, убранных из «Продолжить» книг,
раньше жил в localStorage устройства; клиент один раз переносит его сюда.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "user_resume_hidden"
down_revision: str | None = "default_accent_blue"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("resume_hidden", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "resume_hidden")
