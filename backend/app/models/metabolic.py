"""
Metabolic Budget data models.

Tables:
- metabolic_budgets   – per-user guardrail targets + scoring weights
- metabolic_scores    – per-meal and daily MES scores
- metabolic_streaks   – consecutive-day energy streak tracking
"""
import uuid
from datetime import datetime, date as date_type
from sqlalchemy import (
    Column, String, DateTime, Date, Float, Integer,
    ForeignKey, JSON, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from app.db import Base, GUID


class MetabolicBudget(Base):
    """Per-user metabolic guardrails and scoring weights."""
    __tablename__ = "metabolic_budgets"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False, unique=True, index=True)

    # ── Guardrails ──
    protein_target_g = Column(Float, default=130.0)
    fiber_floor_g = Column(Float, default=30.0)
    sugar_ceiling_g = Column(Float, default=130.0)  # was 200; now carb ceiling

    # ── Score weights (4-sub-score: GIS/PAS/FS/FAS) ──
    weight_protein = Column(Float, default=0.30)
    weight_fiber = Column(Float, default=0.20)
    weight_sugar = Column(Float, default=0.35)   # maps to GIS weight
    weight_fat = Column(Float, default=0.15)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")


class MetabolicScore(Base):
    """Stores per-meal and daily MES scores."""
    __tablename__ = "metabolic_scores"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    scope = Column(String, nullable=False)  # "meal" | "daily"

    # Source info (nullable for daily scope)
    food_log_id = Column(GUID, ForeignKey("food_logs.id"), nullable=True)

    # Sub-scores
    protein_score = Column(Float, default=0)
    fiber_score = Column(Float, default=0)
    sugar_score = Column(Float, default=0)
    total_score = Column(Float, default=0)  # weighted composite (raw — used for gating/logic)
    display_score = Column(Float, default=0)  # calibrated for UI (raw + offset, capped 100)
    display_tier = Column(String, default="critical")  # tier from display_score

    # Raw values that produced the scores (for UI display)
    protein_g = Column(Float, default=0)
    fiber_g = Column(Float, default=0)
    sugar_g = Column(Float, default=0)

    tier = Column(String, default="critical")  # critical|low|moderate|good|optimal
    meal_context = Column(String, default="full_meal")  # full_meal|meal_component_*|sauce_condiment|dessert|daily
    details_json = Column(JSON, default=dict)  # extensible metadata

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
    food_log = relationship("FoodLog")

    __table_args__ = (
        UniqueConstraint(
            "user_id", "date", "scope", "food_log_id",
            name="uq_metabolic_score_user_date_scope_log",
        ),
    )


class MetabolicStreak(Base):
    """Tracks consecutive days where daily MES >= threshold."""
    __tablename__ = "metabolic_streaks"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    current_streak = Column(Integer, default=0)
    longest_streak = Column(Integer, default=0)
    last_qualifying_date = Column(Date, nullable=True)
    threshold = Column(Float, default=55.0)  # >= "Moderate" tier
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
