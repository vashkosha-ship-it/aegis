"""add permanent MyList completion timestamp

Revision ID: mylist_completed_at
Revises: book_index_status
"""

import sqlalchemy as sa
from alembic import op

revision = "mylist_completed_at"
down_revision = "book_index_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mylist_entries",
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Сохраняем имеющуюся историю настолько точно, насколько позволяют старые
    # данные: для уже завершённых книг берём последнее изменение записи.
    op.execute(
        """
        UPDATE mylist_entries
        SET completed_at = updated_at
        WHERE status = 'COMPLETED' AND completed_at IS NULL
        """
    )
    op.create_index(
        "ix_mylist_entries_completed_at",
        "mylist_entries",
        ["completed_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_mylist_entries_completed_at", table_name="mylist_entries")
    op.drop_column("mylist_entries", "completed_at")
