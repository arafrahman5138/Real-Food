"""add needs_default_pairing to recipes

Revision ID: d4e29c10b6af
Revises: a852f1eae6ce
Create Date: 2026-03-03 18:55:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'd4e29c10b6af'
down_revision: Union[str, None] = 'a852f1eae6ce'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('recipes', sa.Column('needs_default_pairing', sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column('recipes', 'needs_default_pairing')
