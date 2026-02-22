import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Boolean, ForeignKey, JSON, Float
from sqlalchemy.orm import relationship
from app.db import Base, GUID


class GroceryList(Base):
    __tablename__ = "grocery_lists"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False)
    meal_plan_id = Column(GUID, ForeignKey("meal_plans.id"), nullable=True)
    items = Column(JSON, default=list)
    price_estimates = Column(JSON, default=dict)
    total_estimated_cost = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="grocery_lists")
    meal_plan = relationship("MealPlan", back_populates="grocery_list")
