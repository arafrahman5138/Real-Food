import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Boolean, JSON, Text
from app.db import Base, GUID


class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    ingredients = Column(JSON, default=list)
    steps = Column(JSON, default=list)
    prep_time_min = Column(Integer, default=0)
    cook_time_min = Column(Integer, default=0)
    total_time_min = Column(Integer, default=0)
    servings = Column(Integer, default=1)
    nutrition_info = Column(JSON, default=dict)
    difficulty = Column(String, default="easy")
    tags = Column(JSON, default=list)
    flavor_profile = Column(JSON, default=list)
    dietary_tags = Column(JSON, default=list)
    cuisine = Column(String, default="american", index=True)
    health_benefits = Column(JSON, default=list)
    protein_type = Column(JSON, default=list)
    carb_type = Column(JSON, default=list)
    is_ai_generated = Column(Boolean, default=True)
    image_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
