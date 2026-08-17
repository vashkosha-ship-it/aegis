"""add token_version and widen hashed OTP columns

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-17

Одноразовые коды теперь хранятся как HMAC-SHA256 (64 hex-символа),
поэтому колонки String(16) расширяются до String(128).
token_version позволяет мгновенно отзывать все выданные JWT.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
    )
    for col in ("verify_code", "reset_code", "email_change_code"):
        op.alter_column(
            "users",
            col,
            existing_type=sa.String(length=16),
            type_=sa.String(length=128),
            existing_nullable=True,
        )
    # Старые коды в открытом виде больше не совпадут с HMAC-хешами —
    # чистим, чтобы пользователи сразу запросили новые.
    op.execute("UPDATE users SET verify_code = NULL, verify_expires = NULL")
    op.execute("UPDATE users SET reset_code = NULL, reset_expires = NULL")
    op.execute(
        "UPDATE users SET pending_email = NULL, email_change_code = NULL, "
        "email_change_expires = NULL"
    )


def downgrade() -> None:
    for col in ("verify_code", "reset_code", "email_change_code"):
        op.alter_column(
            "users",
            col,
            existing_type=sa.String(length=128),
            type_=sa.String(length=16),
            existing_nullable=True,
        )
    op.drop_column("users", "token_version")
