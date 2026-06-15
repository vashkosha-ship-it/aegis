"""add fulltext search

Полнотекстовый поиск (H):
- book_pages: постраничный текст PDF + tsvector (generated) + GIN-индекс
- books.search_vector: tsvector по метаданным (title/author/description) + GIN

Используется встроенный PostgreSQL full-text с русской конфигурацией.

Revision ID: d6f7a8b9c0e1
Revises: c5e6f7a8b9d0
Create Date: 2026-06-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d6f7a8b9c0e1"
down_revision: Union[str, None] = "c5e6f7a8b9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Таблица постраничного текста книг ---
    op.create_table(
        "book_pages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("book_id", sa.Integer(), nullable=False),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("book_id", "page", name="uq_book_page"),
    )
    op.create_index("ix_book_pages_book_id", "book_pages", ["book_id"])

    # tsvector как generated column (Postgres 12+). Авто-обновляется при изменении content.
    op.execute(
        "ALTER TABLE book_pages "
        "ADD COLUMN search_vector tsvector "
        "GENERATED ALWAYS AS (to_tsvector('russian', coalesce(content, ''))) STORED"
    )
    op.execute(
        "CREATE INDEX ix_book_pages_search ON book_pages USING GIN (search_vector)"
    )

    # --- search_vector по метаданным книги ---
    op.execute(
        "ALTER TABLE books "
        "ADD COLUMN search_vector tsvector "
        "GENERATED ALWAYS AS ("
        "  setweight(to_tsvector('russian', coalesce(title, '')), 'A') || "
        "  setweight(to_tsvector('russian', coalesce(author, '')), 'B') || "
        "  setweight(to_tsvector('russian', coalesce(description, '')), 'C')"
        ") STORED"
    )
    op.execute(
        "CREATE INDEX ix_books_search ON books USING GIN (search_vector)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_books_search")
    op.execute("ALTER TABLE books DROP COLUMN IF EXISTS search_vector")
    op.execute("DROP INDEX IF EXISTS ix_book_pages_search")
    op.drop_index("ix_book_pages_book_id", table_name="book_pages")
    op.drop_table("book_pages")
