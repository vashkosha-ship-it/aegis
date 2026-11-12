"""books: file_problem — файл не открывается, книга скрыта от читателей

Revision ID: book_file_problem
Revises: comment_updated_at
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "book_file_problem"
down_revision: str | None = "comment_updated_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("books", sa.Column("file_problem", sa.String(16), nullable=True))
    op.add_column("books", sa.Column("file_problem_detail", sa.Text(), nullable=True))
    op.add_column("books", sa.Column("file_checked_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_books_file_problem", "books", ["file_problem"])


def downgrade() -> None:
    op.drop_index("ix_books_file_problem", table_name="books")
    op.drop_column("books", "file_checked_at")
    op.drop_column("books", "file_problem_detail")
    op.drop_column("books", "file_problem")
