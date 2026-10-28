"""team reading assignments and department managers

Revision ID: team_reading_assignments
Revises: book_metadata_jobs

Добавляет users.managed_department и таблицу reading_assignments. Книги,
которые раньше администратор отмечал «обязательной для подразделения»
(books.required_for_department), переносятся в назначения этого отдела.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "team_reading_assignments"
down_revision: str | None = "book_metadata_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("managed_department", sa.String(length=64), nullable=True))
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
    op.execute(
        "INSERT INTO reading_assignments (department, book_id) "
        "SELECT required_for_department, id FROM books "
        "WHERE required_for_department IS NOT NULL AND required_for_department <> ''"
    )


def downgrade() -> None:
    op.drop_index("ix_reading_assignments_book_id", table_name="reading_assignments")
    op.drop_index("ix_reading_assignments_department", table_name="reading_assignments")
    op.drop_table("reading_assignments")
    op.drop_column("users", "managed_department")
