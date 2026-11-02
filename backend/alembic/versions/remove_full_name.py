"""remove full name (ФИО) from users and certificates

Revision ID: remove_full_name
Revises: remove_departments

ФИО в приложении больше не спрашивается и не хранится. Сертификаты
выписываются на логин, поэтому имя в таблице certificates тоже не нужно.

Данные этих полей теряются; откат восстанавливает только структуру
(пустые поля, у сертификатов — логин вместо имени).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "remove_full_name"
down_revision: str | None = "remove_departments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS full_name")
    op.execute("ALTER TABLE certificates DROP COLUMN IF EXISTS full_name")


def downgrade() -> None:
    op.add_column("users", sa.Column("full_name", sa.String(length=128), nullable=True))
    op.add_column("certificates", sa.Column("full_name", sa.String(length=128), nullable=True))
    op.execute(
        "UPDATE certificates SET full_name = users.username FROM users WHERE users.id = certificates.user_id"
    )
    op.alter_column("certificates", "full_name", nullable=False)
