from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import date


class MealPlanPreferences(BaseModel):
    flavor_preferences: List[str] = Field(default_factory=list)  # spicy, savory, sweet, umami, mild
    dietary_restrictions: List[str] = Field(default_factory=list)  # vegan, vegetarian, gluten-free, etc.
    allergies: List[str] = Field(default_factory=list)
    liked_ingredients: List[str] = Field(default_factory=list)
    disliked_ingredients: List[str] = Field(default_factory=list)
    protein_preferences: dict = Field(default_factory=dict)
    cooking_time_budget: dict = Field(default_factory=lambda: {
        "quick": 4,    # number of quick meals per week
        "medium": 2,   # number of medium meals per week
        "long": 1      # number of longer meals per week
    })
    household_size: int = 1
    budget_level: str = "medium"  # low, medium, high
    bulk_cook_preference: bool = True
    meals_per_day: int = 3  # 2 or 3
    variety_mode: Literal["prep_heavy", "balanced", "variety_heavy"] = "balanced"
    preferred_recipe_ids: List[str] = Field(default_factory=list)
    avoided_recipe_ids: List[str] = Field(default_factory=list)


class MealPlanGenerate(BaseModel):
    week_start: Optional[date] = None
    preferences: Optional[MealPlanPreferences] = None
    apply_substitutions: bool = False


class MealPlanShortlistRequest(BaseModel):
    preferences: Optional[MealPlanPreferences] = None


class MealPlanQualitySummary(BaseModel):
    target_meal_display_mes: float = 70.0
    target_daily_average_display_mes: float = 70.0
    actual_weekly_average_daily_display_mes: float = 0.0
    qualifying_meal_count: int = 0
    total_meal_count: int = 0
    days_meeting_target: int = 0
    total_days: int = 0


class MealPlanPrepEntry(BaseModel):
    prep_group_id: str
    recipe_id: str
    recipe_title: str
    meal_type: str
    prep_day: str
    covers_days: List[str] = Field(default_factory=list)
    servings_to_make: int = 0
    summary_text: str


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
    quality_summary: Optional[MealPlanQualitySummary] = None
    prep_timeline: List[MealPlanPrepEntry] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)

    class Config:
        from_attributes = True


class MealPlanShortlistRecipe(BaseModel):
    id: str
    title: str
    description: str = ""
    meal_type: str
    total_time_min: int = 0
    difficulty: str = "easy"
    mes_display_score: float = 0.0
    mes_display_tier: str = "critical"
    meets_mes_target: bool = False


class MealPlanShortlistSection(BaseModel):
    meal_type: str
    items: List[MealPlanShortlistRecipe] = Field(default_factory=list)


class MealPlanShortlistResponse(BaseModel):
    sections: List[MealPlanShortlistSection] = Field(default_factory=list)


class MealPlanReplacementOption(BaseModel):
    recipe_id: str
    title: str
    description: str = ""
    total_time_min: int = 0
    difficulty: str = "easy"
    mes_display_score: float = 0.0
    mes_display_tier: str = "critical"


class MealPlanReplacementOptionsResponse(BaseModel):
    item_id: str
    meal_type: str
    options: List[MealPlanReplacementOption] = Field(default_factory=list)


class MealPlanReplaceRequest(BaseModel):
    recipe_id: str
