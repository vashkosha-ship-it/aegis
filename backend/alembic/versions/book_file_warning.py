"""books.file_warning — EPUB, перегнанный из PDF (подсказка админу)

Revision ID: book_file_warning
Revises: user_activity_events
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "book_file_warning"
down_revision: str | None = "user_activity_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("books", sa.Column("file_warning", sa.String(32), nullable=True))


def downgrade() -> None:
    op.drop_column("books", "file_warning")
