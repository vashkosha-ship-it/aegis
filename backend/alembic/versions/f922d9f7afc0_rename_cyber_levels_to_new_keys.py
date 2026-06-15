"""rename_cyber_levels_to_new_keys

Revision ID: f922d9f7afc0
Revises: d5ce34412b46
Create Date: 2026-05-19 13:30:37.607812

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f922d9f7afc0'
down_revision: Union[str, None] = 'd5ce34412b46'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE users SET cyber_level = 'gate_guardian' WHERE cyber_level = 'intern'")
    op.execute("UPDATE users SET cyber_level = 'scout' WHERE cyber_level = 'amateur'")
    op.execute("UPDATE users SET cyber_level = 'stronghold' WHERE cyber_level = 'specialist'")
    op.execute("UPDATE users SET cyber_level = 'shadow_architect' WHERE cyber_level = 'professional'")
    op.execute("UPDATE users SET cyber_level = 'abyss_warden' WHERE cyber_level = 'architect'")


def downgrade() -> None:
    op.execute("UPDATE users SET cyber_level = 'intern' WHERE cyber_level = 'gate_guardian'")
    op.execute("UPDATE users SET cyber_level = 'amateur' WHERE cyber_level = 'scout'")
    op.execute("UPDATE users SET cyber_level = 'specialist' WHERE cyber_level = 'stronghold'")
    op.execute("UPDATE users SET cyber_level = 'professional' WHERE cyber_level = 'shadow_architect'")
    op.execute("UPDATE users SET cyber_level = 'architect' WHERE cyber_level = 'abyss_warden'")