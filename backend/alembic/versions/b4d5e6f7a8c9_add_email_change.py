"""add email change fields

Добавляет в users поля pending_email, email_change_code, email_change_expires
для механизма смены email с подтверждением по коду (G/SMTP).

Revision ID: b4d5e6f7a8c9
Revises: a3c4d5e6f7b8
Create Date: 2026-06-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b4d5e6f7a8c9"
down_revision: Union[str, None] = "a3c4d5e6f7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("pending_email", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("email_change_code", sa.String(length=16), nullable=True))
    op.add_column("users", sa.Column("email_change_expires", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "email_change_expires")
    op.drop_column("users", "email_change_code")
    op.drop_column("users", "pending_email")
