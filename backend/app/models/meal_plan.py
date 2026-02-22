import uuid
from datetime import datetime, date
from sqlalchemy import Column, String, Integer, DateTime, Date, Boolean, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from app.db import Base, GUID


class MealPlan(Base):
    __tablename__ = "meal_plans"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False)
    week_start = Column(Date, nullable=False)
    preferences_snapshot = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="meal_plans")
    items = relationship("MealPlanItem", back_populates="meal_plan", cascade="all, delete-orphan")
    grocery_list = relationship("GroceryList", back_populates="meal_plan", uselist=False)


class MealPlanItem(Base):
    __tablename__ = "meal_plan_items"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    meal_plan_id = Column(GUID, ForeignKey("meal_plans.id"), nullable=False)
    recipe_id = Column(GUID, ForeignKey("recipes.id"), nullable=True)
    day_of_week = Column(String, nullable=False)
    meal_type = Column(String, nullable=False)
    meal_category = Column(String, default="quick")
    is_bulk_cook = Column(Boolean, default=False)
    servings = Column(Integer, default=1)
    recipe_data = Column(JSON, default=dict)

    meal_plan = relationship("MealPlan", back_populates="items")
    recipe = relationship("Recipe")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False)
    title = Column(String, default="New Chat")
    messages = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="chat_sessions")
