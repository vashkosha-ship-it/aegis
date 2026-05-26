"""add_department_to_user

Revision ID: 11ef33fb4430
Revises: f922d9f7afc0
Create Date: 2026-05-26 10:02:40.298644

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '11ef33fb4430'
down_revision: Union[str, None] = 'f922d9f7afc0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('department', sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'department')