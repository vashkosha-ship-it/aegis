"""add persistent book indexing status

Revision ID: book_index_status
Revises: add_epub_files
"""

import sqlalchemy as sa
from alembic import op

revision = "book_index_status"
down_revision = "add_epub_files"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "books",
        sa.Column("indexing_status", sa.String(length=16), nullable=False,
                  server_default="not_indexed"),
    )
    op.add_column("books", sa.Column("indexing_error", sa.Text(), nullable=True))
    op.add_column("books", sa.Column("indexing_job_id", sa.String(length=64), nullable=True))
    op.add_column("books", sa.Column("indexing_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("books", sa.Column("indexing_finished_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("books", sa.Column("indexed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "books",
        sa.Column("indexed_sections", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_check_constraint(
        "ck_books_indexing_status", "books",
        "indexing_status IN ('not_indexed', 'queued', 'running', 'succeeded', 'failed')",
    )
    op.execute(
        """
        UPDATE books
        SET indexing_status = 'succeeded',
            indexed_sections = indexed.count,
            indexed_at = now(),
            indexing_finished_at = now()
        FROM (
            SELECT book_id, count(*)::integer AS count
            FROM book_pages
            GROUP BY book_id
        ) AS indexed
        WHERE books.id = indexed.book_id
        """
    )


def downgrade() -> None:
    op.drop_constraint("ck_books_indexing_status", "books", type_="check")
    for column in (
        "indexed_sections", "indexed_at", "indexing_finished_at",
        "indexing_started_at", "indexing_job_id", "indexing_error", "indexing_status",
    ):
        op.drop_column("books", column)
