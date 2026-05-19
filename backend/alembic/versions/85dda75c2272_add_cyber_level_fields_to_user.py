"""add cyber_level fields to user
 
Revision ID: <ВСТАВЬ_СВОЙ_HASH>
Revises: e9a931b2166e
Create Date: 2026-05-07
 
"""
from typing import Sequence, Union
 
from alembic import op
import sqlalchemy as sa
revision: str = '85dda75c2272'
down_revision: Union[str, None] = 'e9a931b2166e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('cyber_level', sa.String(length=32), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('topic_scores', sa.JSON(), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('level_assessed_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('users', 'level_assessed_at')
    op.drop_column('users', 'topic_scores')
    op.drop_column('users', 'cyber_level')