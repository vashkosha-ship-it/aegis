"""add books.file_sha256 for duplicate detection

Revision ID: book_file_sha256
Revises: admin_mfa_audit
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "book_file_sha256"
down_revision: str | None = "admin_mfa_audit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("books", sa.Column("file_sha256", sa.String(64), nullable=True))
    op.create_index("ix_books_file_sha256", "books", ["file_sha256"])


def downgrade() -> None:
    op.drop_index("ix_books_file_sha256", table_name="books")
    op.drop_column("books", "file_sha256")
