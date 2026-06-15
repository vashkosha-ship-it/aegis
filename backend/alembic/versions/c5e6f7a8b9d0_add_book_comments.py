"""add book comments (discussions)

Создаёт таблицу book_comments для обсуждений книг
(комментарии + ответы, дерево в 1 уровень).

Revision ID: c5e6f7a8b9d0
Revises: b4d5e6f7a8c9
Create Date: 2026-06-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c5e6f7a8b9d0"
down_revision: Union[str, None] = "b4d5e6f7a8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "book_comments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("book_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["book_comments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_book_comments_book_id", "book_comments", ["book_id"])
    op.create_index("ix_book_comments_user_id", "book_comments", ["user_id"])
    op.create_index("ix_book_comments_parent_id", "book_comments", ["parent_id"])


def downgrade() -> None:
    op.drop_index("ix_book_comments_parent_id", table_name="book_comments")
    op.drop_index("ix_book_comments_user_id", table_name="book_comments")
    op.drop_index("ix_book_comments_book_id", table_name="book_comments")
    op.drop_table("book_comments")
