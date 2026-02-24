import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, JSON
from sqlalchemy.orm import relationship
from app.db import Base, GUID


class User(Base):
    __tablename__ = "users"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)
    name = Column(String, nullable=False)
    auth_provider = Column(String, default="email")
    dietary_preferences = Column(JSON, default=list)
    flavor_preferences = Column(JSON, default=list)
    allergies = Column(JSON, default=list)
    liked_ingredients = Column(JSON, default=list)
    disliked_ingredients = Column(JSON, default=list)
    protein_preferences = Column(JSON, default=dict)
    cooking_time_budget = Column(JSON, default=dict)
    household_size = Column(Integer, default=1)
    budget_level = Column(String, default="medium")
    xp_points = Column(Integer, default=0)
    current_streak = Column(Integer, default=0)
    longest_streak = Column(Integer, default=0)
    last_active_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    meal_plans = relationship("MealPlan", back_populates="user")
    grocery_lists = relationship("GroceryList", back_populates="user")
    chat_sessions = relationship("ChatSession", back_populates="user")
    achievements = relationship("UserAchievement", back_populates="user")
