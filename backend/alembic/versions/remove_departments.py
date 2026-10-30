"""remove departments, managers and reading assignments

Revision ID: remove_departments
Revises: user_must_change_password

Назначение книг отделам и сами отделы из приложения убраны. Удаляются
таблицы reading_assignments и org_units и поля users.department,
users.managed_department, books.required_for_department.

Данные этих таблиц и полей теряются. Откат восстанавливает только
структуру (пустые таблицы и поля), не содержимое — перед обновлением
сервера сделайте резервную копию базы, если они могут понадобиться.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "remove_departments"
down_revision: str | None = "user_must_change_password"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS reading_assignments")
    op.execute("DROP TABLE IF EXISTS org_units")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS department")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS managed_department")
    op.execute("ALTER TABLE books DROP COLUMN IF EXISTS required_for_department")


def downgrade() -> None:
    op.add_column("books", sa.Column("required_for_department", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("managed_department", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("department", sa.String(length=64), nullable=True))
    op.create_table(
        "org_units",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=True),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="department"),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["org_units.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_org_units_code"),
    )
    op.create_index("ix_org_units_parent_id", "org_units", ["parent_id"])
    op.create_table(
        "reading_assignments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("department", sa.String(length=64), nullable=False),
        sa.Column("book_id", sa.Integer(), nullable=False),
        sa.Column("assigned_by_id", sa.Integer(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assigned_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("department", "book_id", name="uq_reading_assignment_department_book"),
    )
    op.create_index("ix_reading_assignments_department", "reading_assignments", ["department"])
    op.create_index("ix_reading_assignments_book_id", "reading_assignments", ["book_id"])
