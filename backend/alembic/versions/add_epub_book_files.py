"""add EPUB storage and active book format

Revision ID: add_epub_files
Revises: reading_counters
"""

import sqlalchemy as sa
from alembic import op

revision = "add_epub_files"
down_revision = "reading_counters"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "books",
        sa.Column("epub_storage_key", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "books",
        sa.Column(
            "file_format",
            sa.String(length=8),
            nullable=False,
            server_default="pdf",
        ),
    )
    op.create_check_constraint(
        "ck_books_file_format",
        "books",
        "file_format IN ('pdf', 'epub')",
    )
    op.create_check_constraint(
        "ck_books_active_file_matches_format",
        "books",
        "(pdf_storage_key IS NULL OR file_format = 'pdf') AND "
        "(epub_storage_key IS NULL OR file_format = 'epub')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_books_active_file_matches_format", "books", type_="check"
    )
    op.drop_constraint("ck_books_file_format", "books", type_="check")
    op.drop_column("books", "file_format")
    op.drop_column("books", "epub_storage_key")
