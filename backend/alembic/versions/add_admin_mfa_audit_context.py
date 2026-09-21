"""add admin MFA and audit request context

Revision ID: admin_mfa_audit
Revises: description_jobs
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "admin_mfa_audit"
down_revision: str | None = "description_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("admin_mfa_code", sa.String(128), nullable=True))
    op.add_column(
        "users", sa.Column("admin_mfa_expires", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("users", sa.Column("admin_recovery_codes", sa.JSON(), nullable=True))

    op.add_column(
        "admin_logs",
        sa.Column("result", sa.String(16), server_default="success", nullable=False),
    )
    op.add_column("admin_logs", sa.Column("request_id", sa.String(64), nullable=True))
    op.add_column("admin_logs", sa.Column("ip_address", sa.String(64), nullable=True))
    op.create_index("ix_admin_logs_request_id", "admin_logs", ["request_id"])

    # Все прежние admin-токены выпущены без второго фактора.
    op.execute("UPDATE users SET token_version = token_version + 1 WHERE role = 'ADMIN'")


def downgrade() -> None:
    op.drop_index("ix_admin_logs_request_id", table_name="admin_logs")
    op.drop_column("admin_logs", "ip_address")
    op.drop_column("admin_logs", "request_id")
    op.drop_column("admin_logs", "result")
    op.drop_column("users", "admin_recovery_codes")
    op.drop_column("users", "admin_mfa_expires")
    op.drop_column("users", "admin_mfa_code")
