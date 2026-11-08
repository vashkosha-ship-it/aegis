"""book comments: updated_at (author can edit own comment)

Revision ID: comment_updated_at
Revises: remove_full_name
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "comment_updated_at"
down_revision: str | None = "remove_full_name"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("book_comments", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("book_comments", "updated_at")
