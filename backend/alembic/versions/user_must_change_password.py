"""users.must_change_password и заявки на сброс пароля через администратора

Revision ID: user_must_change_password
Revises: remove_liked_status

Флаг по умолчанию выключен: существующих пользователей не касается.
Включается, только когда администратор сбрасывает пароль пользователю.
password_help_requests — заявки «нет доступа к почте, помогите сменить
пароль»: их видит и закрывает администратор.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "user_must_change_password"
down_revision: str | None = "remove_liked_status"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "password_help_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("contact", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_password_help_requests_user_id", "password_help_requests", ["user_id"])
    op.create_index("ix_password_help_requests_resolved_at", "password_help_requests", ["resolved_at"])


def downgrade() -> None:
    op.drop_index("ix_password_help_requests_resolved_at", table_name="password_help_requests")
    op.drop_index("ix_password_help_requests_user_id", table_name="password_help_requests")
    op.drop_table("password_help_requests")
    op.drop_column("users", "must_change_password")
