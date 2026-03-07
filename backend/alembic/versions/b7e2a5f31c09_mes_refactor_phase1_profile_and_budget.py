"""MES refactor Phase 1 – extend profile, update budget defaults

Add new columns to metabolic_profiles for insulin markers, U.S. height,
age, onboarding progress. Update metabolic_budgets defaults.
Add weight_fat column to metabolic_budgets.

Revision ID: b7e2a5f31c09
Revises: f2c1d8b7a001
Create Date: 2025-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b7e2a5f31c09"
down_revision = "f2c1d8b7a001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── metabolic_profiles: new columns ──
    op.add_column("metabolic_profiles", sa.Column("age", sa.Integer(), nullable=True))
    op.add_column("metabolic_profiles", sa.Column("height_ft", sa.Integer(), nullable=True))
    op.add_column("metabolic_profiles", sa.Column("height_in", sa.Float(), nullable=True))
    op.add_column("metabolic_profiles", sa.Column("body_fat_method", sa.String(), nullable=True))
    op.add_column("metabolic_profiles", sa.Column("insulin_resistant", sa.Boolean(), server_default=sa.text("false"), nullable=True))
    op.add_column("metabolic_profiles", sa.Column("prediabetes", sa.Boolean(), server_default=sa.text("false"), nullable=True))
    op.add_column("metabolic_profiles", sa.Column("type_2_diabetes", sa.Boolean(), server_default=sa.text("false"), nullable=True))
    op.add_column("metabolic_profiles", sa.Column("fasting_glucose_mgdl", sa.Float(), nullable=True))
    op.add_column("metabolic_profiles", sa.Column("hba1c_pct", sa.Float(), nullable=True))
    op.add_column("metabolic_profiles", sa.Column("triglycerides_mgdl", sa.Float(), nullable=True))
    op.add_column("metabolic_profiles", sa.Column("onboarding_step_completed", sa.Integer(), server_default=sa.text("0"), nullable=True))

    # ── metabolic_budgets: add weight_fat, update sugar_ceiling default ──
    op.add_column("metabolic_budgets", sa.Column("weight_fat", sa.Float(), server_default=sa.text("0.15"), nullable=True))

    # Update existing rows to new defaults where they still have old values
    op.execute("UPDATE metabolic_budgets SET sugar_ceiling_g = 130.0 WHERE sugar_ceiling_g = 200.0")
    op.execute("UPDATE metabolic_budgets SET weight_protein = 0.30 WHERE weight_protein = 0.50")
    op.execute("UPDATE metabolic_budgets SET weight_fiber = 0.20 WHERE weight_fiber = 0.25")
    op.execute("UPDATE metabolic_budgets SET weight_sugar = 0.35 WHERE weight_sugar = 0.25")
    op.execute("UPDATE metabolic_budgets SET weight_fat = 0.15 WHERE weight_fat IS NULL")


def downgrade() -> None:
    # ── Revert metabolic_budgets ──
    op.execute("UPDATE metabolic_budgets SET sugar_ceiling_g = 200.0 WHERE sugar_ceiling_g = 130.0")
    op.execute("UPDATE metabolic_budgets SET weight_protein = 0.50 WHERE weight_protein = 0.30")
    op.execute("UPDATE metabolic_budgets SET weight_fiber = 0.25 WHERE weight_fiber = 0.20")
    op.execute("UPDATE metabolic_budgets SET weight_sugar = 0.25 WHERE weight_sugar = 0.35")
    op.drop_column("metabolic_budgets", "weight_fat")

    # ── Revert metabolic_profiles ──
    op.drop_column("metabolic_profiles", "onboarding_step_completed")
    op.drop_column("metabolic_profiles", "triglycerides_mgdl")
    op.drop_column("metabolic_profiles", "hba1c_pct")
    op.drop_column("metabolic_profiles", "fasting_glucose_mgdl")
    op.drop_column("metabolic_profiles", "type_2_diabetes")
    op.drop_column("metabolic_profiles", "prediabetes")
    op.drop_column("metabolic_profiles", "insulin_resistant")
    op.drop_column("metabolic_profiles", "body_fat_method")
    op.drop_column("metabolic_profiles", "height_in")
    op.drop_column("metabolic_profiles", "height_ft")
    op.drop_column("metabolic_profiles", "age")
