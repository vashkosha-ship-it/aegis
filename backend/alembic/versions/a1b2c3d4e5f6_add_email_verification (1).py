"""add email verification fields

Добавляет поля для подтверждения email при регистрации:
is_verified, verify_code, verify_expires.
Существующим пользователям проставляет is_verified=true, чтобы они не были
заблокированы при входе (новая проверка — только для новых регистраций).

Revision ID: a1b2c3d4e5f6
Revises: e7a8b9c0d1f2
Create Date: 2026-06-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "e7a8b9c0d1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_verified", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column("users", sa.Column("verify_code", sa.String(length=16), nullable=True))
    op.add_column(
        "users",
        sa.Column("verify_expires", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("is_approved", sa.Boolean(), server_default="false", nullable=False),
    )
    # Все существующие пользователи считаются подтверждёнными и одобренными
    op.execute("UPDATE users SET is_verified = true, is_approved = true")


def downgrade() -> None:
    op.drop_column("users", "is_approved")
    op.drop_column("users", "verify_expires")
    op.drop_column("users", "verify_code")
    op.drop_column("users", "is_verified")
