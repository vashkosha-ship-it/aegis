"""add SHA-256 of the active book file for duplicate detection

Revision ID: book_file_sha256
Revises: admin_mfa_audit
"""

import sqlalchemy as sa
from alembic import op

revision = "book_file_sha256"
down_revision = "admin_mfa_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Не уникальный индекс: у уже загруженных дубликатов хеши совпадут, и
    # уникальное ограничение не дало бы применить миграцию. Повторную
    # загрузку того же файла запрещает API.
    op.add_column("books", sa.Column("file_sha256", sa.String(length=64), nullable=True))
    op.create_index("ix_books_file_sha256", "books", ["file_sha256"])


def downgrade() -> None:
    op.drop_index("ix_books_file_sha256", table_name="books")
    op.drop_column("books", "file_sha256")
