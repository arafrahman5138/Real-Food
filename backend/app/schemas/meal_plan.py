from pydantic import BaseModel
from typing import Optional, List
from datetime import date


class MealPlanPreferences(BaseModel):
    flavor_preferences: List[str] = []  # spicy, savory, sweet, umami, mild
    dietary_restrictions: List[str] = []  # vegan, vegetarian, gluten-free, etc.
    allergies: List[str] = []
    cooking_time_budget: dict = {
        "quick": 4,    # number of quick meals per week
        "medium": 2,   # number of medium meals per week
        "long": 1      # number of longer meals per week
    }
    household_size: int = 1
    budget_level: str = "medium"  # low, medium, high
    bulk_cook_preference: bool = True
    meals_per_day: int = 3  # 2 or 3


class MealPlanGenerate(BaseModel):
    week_start: Optional[date] = None
    preferences: Optional[MealPlanPreferences] = None


class MealPlanItemResponse(BaseModel):
    id: str
    day_of_week: str
    meal_type: str
    meal_category: str
    is_bulk_cook: bool
    servings: int
    recipe_data: dict

    class Config:
        from_attributes = True


class MealPlanResponse(BaseModel):
    id: str
    week_start: str
    items: List[MealPlanItemResponse]
    created_at: str

    class Config:
        from_attributes = True
