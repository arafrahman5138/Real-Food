"""raise metabolic carb guardrail to 200

Revision ID: f2c1d8b7a001
Revises: d4e29c10b6af
Create Date: 2026-03-04 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f2c1d8b7a001"
down_revision: Union[str, None] = "d4e29c10b6af"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "metabolic_budgets",
        "sugar_ceiling_g",
        existing_type=sa.Float(),
        server_default=sa.text("200"),
        existing_nullable=True,
    )
    op.execute(
        sa.text(
            """
            UPDATE metabolic_budgets
            SET sugar_ceiling_g = 200
            WHERE sugar_ceiling_g IN (25, 36)
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE metabolic_budgets
            SET sugar_ceiling_g = 36
            WHERE sugar_ceiling_g = 200
            """
        )
    )
    op.alter_column(
        "metabolic_budgets",
        "sugar_ceiling_g",
        existing_type=sa.Float(),
        server_default=sa.text("36"),
        existing_nullable=True,
    )
