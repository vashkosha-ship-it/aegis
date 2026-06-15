"""expand book icon to text

Revision ID: 60b4e76d95be
Revises: 85dda75c2272
Create Date: 2026-05-08 10:41:48.330135

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '60b4e76d95be'
down_revision: Union[str, None] = '85dda75c2272'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'books',
        'icon',
        type_=sa.Text(),
        existing_type=sa.String(length=8),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        'books',
        'icon',
        type_=sa.String(length=8),
        existing_type=sa.Text(),
        existing_nullable=False,
    )
