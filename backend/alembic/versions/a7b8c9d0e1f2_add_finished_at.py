"""add finished_at to reading_progress

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-08-18

Отметка о реальном дочитывании книги: раньше «дочитано» определялось только
статусом в списке пользователя, который можно поставить не открывая книгу.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reading_progress",
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Тем, кто уже дочитал книгу до последней страницы, проставим отметку
    # задним числом — иначе достижение выдастся повторно при следующем открытии.
    op.execute(
        "UPDATE reading_progress SET finished_at = last_read_at "
        "WHERE total_pages > 1 AND current_page >= total_pages"
    )


def downgrade() -> None:
    op.drop_column("reading_progress", "finished_at")
