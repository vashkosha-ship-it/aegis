"""many_to_many_categories

Revision ID: 2e8bfc7de214
Revises: 60b4e76d95be
Create Date: 2026-05-14 17:38:44.293018

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '2e8bfc7de214'
down_revision: Union[str, None] = '60b4e76d95be'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
