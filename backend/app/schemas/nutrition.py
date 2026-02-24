from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List


class NutritionTargetsResponse(BaseModel):
    calories_target: float
    protein_g_target: float
    carbs_g_target: float
    fat_g_target: float
    fiber_g_target: float
    micronutrient_targets: Dict[str, float]


class NutritionTargetsUpdate(BaseModel):
    calories_target: Optional[float] = None
    protein_g_target: Optional[float] = None
    carbs_g_target: Optional[float] = None
    fat_g_target: Optional[float] = None
    fiber_g_target: Optional[float] = None
    micronutrient_targets: Optional[Dict[str, float]] = None


class FoodLogCreate(BaseModel):
    date: Optional[str] = None
    meal_type: str = "meal"
    source_type: str = "manual"
    source_id: Optional[str] = None
    title: Optional[str] = None
    servings: float = 1.0
    quantity: float = 1.0
    nutrition: Optional[Dict[str, Any]] = None


class FoodLogUpdate(BaseModel):
    meal_type: Optional[str] = None
    title: Optional[str] = None
    servings: Optional[float] = None
    quantity: Optional[float] = None
    nutrition: Optional[Dict[str, Any]] = None


class FoodLogResponse(BaseModel):
    id: str
    date: str
    meal_type: str
    source_type: str
    source_id: Optional[str] = None
    title: Optional[str] = None
    servings: float
    quantity: float
    nutrition_snapshot: Dict[str, Any]


class DailyNutritionResponse(BaseModel):
    date: str
    totals: Dict[str, float]
    comparison: Dict[str, Dict[str, float | str]]
    daily_score: float
    logs: List[FoodLogResponse]
