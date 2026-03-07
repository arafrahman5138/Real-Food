import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Boolean, JSON, Text
from app.db import Base, GUID


# Valid recipe_role enum values
RECIPE_ROLES = ("full_meal", "protein_base", "carb_base", "veg_side", "sauce", "dessert")


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

    # ── Meal-composition fields (Phase 1) ──────────────────────────────
    recipe_role = Column(String, default="full_meal", index=True)
    is_component = Column(Boolean, default=False)
    meal_group_id = Column(String, nullable=True, index=True)
    default_pairing_ids = Column(JSON, default=list)       # recommended companion recipe ids
    needs_default_pairing = Column(Boolean, nullable=True, default=None)
    component_composition = Column(JSON, nullable=True)     # for composed meals: expected roles/ids
    is_mes_scoreable = Column(Boolean, default=True)
