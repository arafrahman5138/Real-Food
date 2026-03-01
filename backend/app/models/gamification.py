import uuid
from datetime import datetime, date
from sqlalchemy import Column, String, Integer, DateTime, Date, Float, ForeignKey, JSON, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db import Base, GUID


class Achievement(Base):
    __tablename__ = "achievements"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, unique=True, nullable=False)
    description = Column(String, nullable=False)
    icon = Column(String, default="trophy")
    xp_reward = Column(Integer, default=0)
    criteria = Column(JSON, default=dict)
    category = Column(String, default="general")
    created_at = Column(DateTime, default=datetime.utcnow)

    user_achievements = relationship("UserAchievement", back_populates="achievement")


class UserAchievement(Base):
    __tablename__ = "user_achievements"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False)
    achievement_id = Column(GUID, ForeignKey("achievements.id"), nullable=False)
    unlocked_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="achievements")
    achievement = relationship("Achievement", back_populates="user_achievements")


class XPTransaction(Base):
    __tablename__ = "xp_transactions"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False)
    amount = Column(Integer, nullable=False)
    reason = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class NutritionStreak(Base):
    """Tracks consecutive days where daily_score >= threshold."""
    __tablename__ = "nutrition_streaks"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    current_streak = Column(Integer, default=0)
    longest_streak = Column(Integer, default=0)
    last_qualifying_date = Column(Date, nullable=True)
    threshold = Column(Float, default=60.0)  # Bronze ≥60
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")


class DailyQuest(Base):
    """Backend-persisted daily quests generated per user."""
    __tablename__ = "daily_quests"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    quest_type = Column(String, nullable=False)       # general / logging / quality
    title = Column(String, nullable=False)
    description = Column(String, default="")
    target_value = Column(Float, default=1.0)
    current_value = Column(Float, default=0.0)
    xp_reward = Column(Integer, default=50)
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    metadata_json = Column(JSON, default=dict)         # e.g. {"nutrient": "protein_g", "target": 130}
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("user_id", "date", "quest_type", name="uq_daily_quest_user_date_type"),
    )
