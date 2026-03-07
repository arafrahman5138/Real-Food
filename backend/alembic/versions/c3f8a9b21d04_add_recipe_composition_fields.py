"""add recipe composition fields

Revision ID: c3f8a9b21d04
Revises: 101ae474f691
Create Date: 2026-03-02 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'c3f8a9b21d04'
down_revision: Union[str, None] = '101ae474f691'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('recipes', sa.Column('recipe_role', sa.String(), server_default='full_meal', nullable=True))
    op.add_column('recipes', sa.Column('is_component', sa.Boolean(), server_default='0', nullable=True))
    op.add_column('recipes', sa.Column('meal_group_id', sa.String(), nullable=True))
    op.add_column('recipes', sa.Column('default_pairing_ids', sa.JSON(), nullable=True))
    op.add_column('recipes', sa.Column('component_composition', sa.JSON(), nullable=True))
    op.add_column('recipes', sa.Column('is_mes_scoreable', sa.Boolean(), server_default='1', nullable=True))
    op.create_index(op.f('ix_recipes_recipe_role'), 'recipes', ['recipe_role'], unique=False)
    op.create_index(op.f('ix_recipes_meal_group_id'), 'recipes', ['meal_group_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_recipes_meal_group_id'), table_name='recipes')
    op.drop_index(op.f('ix_recipes_recipe_role'), table_name='recipes')
    op.drop_column('recipes', 'is_mes_scoreable')
    op.drop_column('recipes', 'component_composition')
    op.drop_column('recipes', 'default_pairing_ids')
    op.drop_column('recipes', 'meal_group_id')
    op.drop_column('recipes', 'is_component')
    op.drop_column('recipes', 'recipe_role')
