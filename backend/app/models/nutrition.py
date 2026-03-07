import uuid
from datetime import datetime, date
from sqlalchemy import Column, String, DateTime, Date, ForeignKey, JSON, Float, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db import Base, GUID


class NutritionTarget(Base):
    __tablename__ = "nutrition_targets"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False, unique=True, index=True)

    calories_target = Column(Float, default=2200)
    protein_g_target = Column(Float, default=130)
    carbs_g_target = Column(Float, default=250)
    fat_g_target = Column(Float, default=75)
    fiber_g_target = Column(Float, default=30)

    micronutrient_targets = Column(JSON, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")


class FoodLog(Base):
    __tablename__ = "food_logs"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    meal_type = Column(String, default="meal")  # breakfast/lunch/dinner/snack

    source_type = Column(String, default="manual")  # manual|recipe|meal_plan|cook_mode
    source_id = Column(String, nullable=True)
    group_id = Column(String, nullable=True, index=True)  # links main meal + side logs
    group_mes_score = Column(Float, nullable=True)  # combined MES score for grouped meals
    group_mes_tier = Column(String, nullable=True)   # combined MES tier for grouped meals

    quantity = Column(Float, default=1.0)
    servings = Column(Float, default=1.0)

    title = Column(String, nullable=True)
    nutrition_snapshot = Column(JSON, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")


class DailyNutritionSummary(Base):
    __tablename__ = "daily_nutrition_summary"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)

    totals_json = Column(JSON, default=dict)
    comparison_json = Column(JSON, default=dict)
    daily_score = Column(Float, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_daily_nutrition_user_date"),
    )
