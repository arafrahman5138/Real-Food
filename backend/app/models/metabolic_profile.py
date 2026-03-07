"""
Metabolic Profile – onboarding biometrics & derived targets.

Collects height, sex, weight, body-fat %, goal, and activity level.
Derives target bodyweight and personalised protein target.
Extended with insulin-sensitivity markers and U.S. height fields.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float, Integer, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.db import Base, GUID


class MetabolicProfile(Base):
    __tablename__ = "metabolic_profiles"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False, unique=True, index=True)

    # ── Core biometrics (U.S. units) ──
    sex = Column(String, nullable=True)                 # male / female / other
    age = Column(Integer, nullable=True)
    height_cm = Column(Float, nullable=True)            # kept for backward compat
    height_ft = Column(Integer, nullable=True)          # U.S. primary
    height_in = Column(Float, nullable=True)            # fractional inches
    weight_lb = Column(Float, nullable=True)
    body_fat_pct = Column(Float, nullable=True)
    body_fat_method = Column(String, nullable=True)     # dexa / calipers / visual / bioimpedance

    # ── Goal & activity ──
    goal = Column(String, nullable=True)                # fat_loss / maintenance / muscle_gain / metabolic_reset
    activity_level = Column(String, nullable=True)      # sedentary / moderate / active / athletic

    # ── Insulin-sensitivity markers ──
    insulin_resistant = Column(Boolean, default=False)
    prediabetes = Column(Boolean, default=False)
    type_2_diabetes = Column(Boolean, default=False)
    fasting_glucose_mgdl = Column(Float, nullable=True)
    hba1c_pct = Column(Float, nullable=True)
    triglycerides_mgdl = Column(Float, nullable=True)

    # ── Derived planning values ──
    target_weight_lb = Column(Float, nullable=True)
    protein_target_g = Column(Float, nullable=True)

    # ── Onboarding progress ──
    onboarding_step_completed = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
