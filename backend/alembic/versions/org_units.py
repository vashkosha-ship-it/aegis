"""org units: directorates and departments

Revision ID: org_units
Revises: team_reading_assignments

Справочник подразделений. Заполняется кодами, которые уже используются:
список из формы регистрации, подразделения пользователей и назначений. Все
они становятся самостоятельными отделами — администратор потом сам
объединит их в управления.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "org_units"
down_revision: str | None = "team_reading_assignments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

REGISTRATION_CODES = ["ЦКЗ", "ДПМ", "УБД", "УКИИ", "УКАИ", "УМК", "УЭК", "ЦКГ", "ЦУПКБ", "ЦВВ"]


def upgrade() -> None:
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

    bind = op.get_bind()
    codes = set(REGISTRATION_CODES)
    for query in (
        "SELECT DISTINCT department FROM users WHERE department IS NOT NULL",
        "SELECT DISTINCT managed_department FROM users WHERE managed_department IS NOT NULL",
        "SELECT DISTINCT department FROM reading_assignments",
    ):
        codes.update(row[0].strip() for row in bind.execute(sa.text(query)) if row[0] and row[0].strip())
    table = sa.table("org_units", sa.column("code"), sa.column("kind"))
    op.bulk_insert(table, [{"code": code, "kind": "department"} for code in sorted(codes)])
    # Значения с пробелами по краям приводим к коду из справочника.
    bind.execute(sa.text("UPDATE users SET department = btrim(department) WHERE department <> btrim(department)"))


def downgrade() -> None:
    op.drop_index("ix_org_units_parent_id", table_name="org_units")
    op.drop_table("org_units")
