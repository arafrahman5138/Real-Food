"""Pydantic schemas for Metabolic Budget endpoints."""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict


# ──────────────────── Sub-score detail ──────────

class SubScores(BaseModel):
    gis: float = 0
    pas: float = 0
    fs: float = 0
    fas: float = 0


class WeightsUsed(BaseModel):
    gis: float = 0.35
    protein: float = 0.30
    fiber: float = 0.20
    fat: float = 0.15


# ──────────────────── Budget ────────────────────

class MetabolicBudgetResponse(BaseModel):
    protein_target_g: float
    fiber_floor_g: float
    sugar_ceiling_g: float
    weight_protein: float
    weight_fiber: float
    weight_sugar: float
    # ── New fields ──
    carb_ceiling_g: float = 130.0
    fat_target_g: float = 0
    weight_fat: float = 0.15
    weight_gis: float = 0.35
    tdee: Optional[float] = None
    ism: Optional[float] = None
    # ── Phase 6: Threshold context ──
    tier_thresholds: Optional[Dict[str, int]] = None
    threshold_context: Optional[Dict[str, str]] = None


class MetabolicBudgetUpdate(BaseModel):
    protein_target_g: Optional[float] = None
    fiber_floor_g: Optional[float] = None
    sugar_ceiling_g: Optional[float] = None
    weight_protein: Optional[float] = None
    weight_fiber: Optional[float] = None
    weight_sugar: Optional[float] = None
    weight_fat: Optional[float] = None


# ──────────────────── Profile / Onboarding ──────

class MetabolicProfileCreate(BaseModel):
    sex: Optional[str] = None
    age: Optional[int] = None
    height_cm: Optional[float] = None
    height_ft: Optional[int] = None
    height_in: Optional[float] = None
    weight_lb: Optional[float] = None
    body_fat_pct: Optional[float] = None
    body_fat_method: Optional[str] = None
    goal: Optional[str] = None
    activity_level: Optional[str] = None
    target_weight_lb: Optional[float] = None
    insulin_resistant: Optional[bool] = None
    prediabetes: Optional[bool] = None
    type_2_diabetes: Optional[bool] = None
    fasting_glucose_mgdl: Optional[float] = None
    hba1c_pct: Optional[float] = None
    triglycerides_mgdl: Optional[float] = None


class MetabolicProfileResponse(BaseModel):
    sex: Optional[str] = None
    age: Optional[int] = None
    height_cm: Optional[float] = None
    height_ft: Optional[int] = None
    height_in: Optional[float] = None
    weight_lb: Optional[float] = None
    body_fat_pct: Optional[float] = None
    body_fat_method: Optional[str] = None
    goal: Optional[str] = None
    activity_level: Optional[str] = None
    target_weight_lb: Optional[float] = None
    protein_target_g: Optional[float] = None
    insulin_resistant: Optional[bool] = None
    prediabetes: Optional[bool] = None
    type_2_diabetes: Optional[bool] = None
    fasting_glucose_mgdl: Optional[float] = None
    hba1c_pct: Optional[float] = None
    triglycerides_mgdl: Optional[float] = None
    onboarding_step_completed: Optional[int] = None


# ──────────────────── Scores ────────────────────

class MESScoreResponse(BaseModel):
    protein_score: float
    fiber_score: float
    sugar_score: float
    total_score: float  # raw MES (backend logic, gating)
    display_score: float = 0  # same as total_score (no inflation)
    tier: str
    display_tier: str = ""  # tier derived from display_score
    protein_g: float = 0
    fiber_g: float = 0
    sugar_g: float = 0
    carbs_g: float = 0
    # ── New fields ──
    meal_mes: Optional[float] = None
    sub_scores: Optional[SubScores] = None
    weights_used: Optional[WeightsUsed] = None
    net_carbs_g: Optional[float] = None
    fat_g: Optional[float] = None


class DailyMESResponse(BaseModel):
    date: str
    score: MESScoreResponse
    remaining: Optional[dict] = None
    treat_impact: Optional[dict] = None
    mea: Optional[dict] = None


class MealMESResponse(BaseModel):
    food_log_id: Optional[str] = None
    title: Optional[str] = None
    score: Optional[MESScoreResponse] = None
    meal_context: str = "full_meal"
    meal_type: Optional[str] = None  # breakfast/lunch/dinner/snack from the food log
    unscored_hint: Optional[str] = None


class ScoreHistoryEntry(BaseModel):
    date: str
    total_score: float
    display_score: float = 0
    tier: str
    display_tier: str = ""


# ──────────────────── Streak ────────────────────

class MetabolicStreakResponse(BaseModel):
    current_streak: int
    longest_streak: int
    threshold: float


# ──────────────────── Preview ───────────────────

class MESPreviewRequest(BaseModel):
    protein_g: float = 0
    fiber_g: float = 0
    carbs_g: float = 0
    sugar_g: float = 0
    fat_g: float = 0
    calories: float = 0


class MESPreviewResponse(BaseModel):
    meal_score: MESScoreResponse
    projected_daily: Optional[MESScoreResponse] = None


# ──────────────────── Remaining budget ──────────

class RemainingBudgetResponse(BaseModel):
    protein_remaining_g: float
    fiber_remaining_g: float
    sugar_headroom_g: float
    carb_headroom_g: float = 0
    fat_remaining_g: float = 0


# ──────────────────── Composite MES ─────────────

class CompositeMESRequest(BaseModel):
    """Request to compute combined MES for multiple food logs."""
    food_log_ids: List[str]


class CompositeMESResponse(BaseModel):
    """Combined MES score for a group of food logs (composite meal)."""
    score: MESScoreResponse
    component_count: int
    total_calories: float = 0
    total_protein_g: float = 0
    total_carbs_g: float = 0
    total_fat_g: float = 0
    total_fiber_g: float = 0


# ──────────────────── Meal suggestions ──────────

class MealSuggestionResponse(BaseModel):
    recipe_id: str
    title: str
    description: Optional[str] = None
    meal_score: float
    meal_tier: str
    projected_daily_score: float
    projected_daily_tier: str
    protein_g: float = 0
    fiber_g: float = 0
    sugar_g: float = 0
    calories: float = 0
    cuisine: Optional[str] = None
    total_time_min: int = 0


# ──────────────────── MEA (Metabolic Energy Adequacy) ─────

class MEAScoreResponse(BaseModel):
    mea_score: float = 0
    caloric_adequacy: float = 0
    macro_balance: float = 0
    daily_mes: float = 0
    energy_prediction: str = "adequate"
    tier: str = "moderate"
