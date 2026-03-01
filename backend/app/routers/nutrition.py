from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.recipe import Recipe
from app.models.local_food import LocalFood
from app.models.meal_plan import MealPlanItem
from app.models.nutrition import NutritionTarget, FoodLog, DailyNutritionSummary
from app.schemas.nutrition import (
    NutritionTargetsResponse,
    NutritionTargetsUpdate,
    FoodLogCreate,
    FoodLogUpdate,
    FoodLogResponse,
    DailyNutritionResponse,
)
from app.achievements_engine import award_xp, update_nutrition_streak, check_achievements

router = APIRouter()


ESSENTIAL_MICROS_DEFAULTS = {
    "vitamin_a_mcg": 900,
    "vitamin_c_mg": 90,
    "vitamin_d_mcg": 20,
    "vitamin_e_mg": 15,
    "vitamin_k_mcg": 120,
    "thiamin_b1_mg": 1.2,
    "riboflavin_b2_mg": 1.3,
    "niacin_b3_mg": 16,
    "vitamin_b6_mg": 1.7,
    "folate_mcg": 400,
    "vitamin_b12_mcg": 2.4,
    "choline_mg": 550,
    "calcium_mg": 1300,
    "iron_mg": 18,
    "magnesium_mg": 420,
    "phosphorus_mg": 1250,
    "potassium_mg": 4700,
    "sodium_mg": 2300,
    "zinc_mg": 11,
    "copper_mg": 0.9,
    "manganese_mg": 2.3,
    "selenium_mcg": 55,
    "iodine_mcg": 150,
    "omega3_g": 1.6,
}

MACRO_KEYS = ["calories", "protein", "carbs", "fat", "fiber"]


def _default_targets() -> NutritionTarget:
    return NutritionTarget(
        calories_target=2200,
        protein_g_target=130,
        carbs_g_target=250,
        fat_g_target=75,
        fiber_g_target=30,
        micronutrient_targets=ESSENTIAL_MICROS_DEFAULTS,
    )


def _get_or_create_targets(db: Session, user_id: str) -> NutritionTarget:
    target = db.query(NutritionTarget).filter(NutritionTarget.user_id == user_id).first()
    if target:
        if not target.micronutrient_targets:
            target.micronutrient_targets = ESSENTIAL_MICROS_DEFAULTS
            db.commit()
            db.refresh(target)
        return target

    target = _default_targets()
    target.user_id = user_id
    db.add(target)
    db.commit()
    db.refresh(target)
    return target


def _parse_date(value: str | None) -> date:
    if not value:
        return datetime.utcnow().date()
    try:
        return datetime.fromisoformat(value).date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")


def _scaled_nutrition(nutrition: dict, factor: float) -> dict:
    out = {}
    for k, v in (nutrition or {}).items():
        try:
            out[k] = float(v) * factor
        except Exception:
            continue
    return out


def _resolve_source_nutrition(db: Session, payload: FoodLogCreate) -> tuple[str, dict]:
    source_type = (payload.source_type or "manual").lower()

    if source_type == "manual":
        if not payload.nutrition:
            raise HTTPException(status_code=400, detail="Manual log requires nutrition payload")
        return payload.title or "Manual Entry", payload.nutrition

    if source_type in {"recipe", "cook_mode"}:
        if not payload.source_id:
            raise HTTPException(status_code=400, detail="source_id is required for recipe/cook_mode")
        recipe = db.query(Recipe).filter(Recipe.id == payload.source_id).first()
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")
        return recipe.title, recipe.nutrition_info or {}

    if source_type == "meal_plan":
        if not payload.source_id:
            raise HTTPException(status_code=400, detail="source_id is required for meal_plan")
        item = db.query(MealPlanItem).filter(MealPlanItem.id == payload.source_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Meal plan item not found")
        title = (item.recipe_data or {}).get("title") or "Meal Plan Item"
        nutrition = (item.recipe_data or {}).get("nutrition_info") or {}
        if not nutrition and item.recipe_id:
            recipe = db.query(Recipe).filter(Recipe.id == item.recipe_id).first()
            nutrition = recipe.nutrition_info if recipe else {}
        return title, nutrition or {}

    raise HTTPException(status_code=400, detail="Unsupported source_type")


def _serialize_log(log: FoodLog) -> FoodLogResponse:
    return FoodLogResponse(
        id=str(log.id),
        date=log.date.isoformat(),
        meal_type=log.meal_type,
        source_type=log.source_type,
        source_id=log.source_id,
        title=log.title,
        servings=float(log.servings or 1),
        quantity=float(log.quantity or 1),
        nutrition_snapshot=log.nutrition_snapshot or {},
    )


def _compute_daily(db: Session, user_id: str, day: date):
    targets = _get_or_create_targets(db, user_id)
    logs = db.query(FoodLog).filter(FoodLog.user_id == user_id, FoodLog.date == day).all()

    totals = {k: 0.0 for k in MACRO_KEYS}
    micros = {k: 0.0 for k in (targets.micronutrient_targets or {}).keys()}

    for log in logs:
        snap = log.nutrition_snapshot or {}
        totals["calories"] += float(snap.get("calories", 0) or 0)
        totals["protein"] += float(snap.get("protein", 0) or snap.get("protein_g", 0) or 0)
        totals["carbs"] += float(snap.get("carbs", 0) or snap.get("carbs_g", 0) or 0)
        totals["fat"] += float(snap.get("fat", 0) or snap.get("fat_g", 0) or 0)
        totals["fiber"] += float(snap.get("fiber", 0) or snap.get("fiber_g", 0) or 0)

        for micro in micros.keys():
            micros[micro] += float(snap.get(micro, 0) or 0)

    comparison = {
        "calories": {
            "consumed": totals["calories"],
            "target": float(targets.calories_target or 0),
            "pct": (totals["calories"] / float(targets.calories_target or 1)) * 100,
        },
        "protein": {
            "consumed": totals["protein"],
            "target": float(targets.protein_g_target or 0),
            "pct": (totals["protein"] / float(targets.protein_g_target or 1)) * 100,
        },
        "carbs": {
            "consumed": totals["carbs"],
            "target": float(targets.carbs_g_target or 0),
            "pct": (totals["carbs"] / float(targets.carbs_g_target or 1)) * 100,
        },
        "fat": {
            "consumed": totals["fat"],
            "target": float(targets.fat_g_target or 0),
            "pct": (totals["fat"] / float(targets.fat_g_target or 1)) * 100,
        },
        "fiber": {
            "consumed": totals["fiber"],
            "target": float(targets.fiber_g_target or 0),
            "pct": (totals["fiber"] / float(targets.fiber_g_target or 1)) * 100,
        },
    }

    for micro, target in (targets.micronutrient_targets or {}).items():
        consumed = float(micros.get(micro, 0) or 0)
        comparison[micro] = {
            "consumed": consumed,
            "target": float(target or 1),
            "pct": (consumed / float(target or 1)) * 100,
        }

    macro_pcts = [
        min(100.0, comparison["protein"]["pct"]),
        min(100.0, comparison["carbs"]["pct"]),
        min(100.0, comparison["fat"]["pct"]),
        min(100.0, comparison["fiber"]["pct"]),
    ]
    micro_values = [min(100.0, v["pct"]) for k, v in comparison.items() if k not in {"calories", "protein", "carbs", "fat", "fiber"}]
    micro_score = sum(micro_values) / len(micro_values) if micro_values else 0
    macro_score = sum(macro_pcts) / len(macro_pcts)
    daily_score = round((macro_score * 0.6) + (micro_score * 0.4), 1)

    summary = (
        db.query(DailyNutritionSummary)
        .filter(DailyNutritionSummary.user_id == user_id, DailyNutritionSummary.date == day)
        .first()
    )
    if not summary:
        summary = DailyNutritionSummary(user_id=user_id, date=day)
        db.add(summary)

    summary.totals_json = {**totals, **micros}
    summary.comparison_json = comparison
    summary.daily_score = daily_score
    db.commit()

    return totals, comparison, daily_score, logs


@router.get("/targets", response_model=NutritionTargetsResponse)
async def get_targets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = _get_or_create_targets(db, current_user.id)
    return NutritionTargetsResponse(
        calories_target=float(t.calories_target or 0),
        protein_g_target=float(t.protein_g_target or 0),
        carbs_g_target=float(t.carbs_g_target or 0),
        fat_g_target=float(t.fat_g_target or 0),
        fiber_g_target=float(t.fiber_g_target or 0),
        micronutrient_targets=t.micronutrient_targets or ESSENTIAL_MICROS_DEFAULTS,
    )


@router.put("/targets", response_model=NutritionTargetsResponse)
async def update_targets(
    payload: NutritionTargetsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = _get_or_create_targets(db, current_user.id)

    for field in ["calories_target", "protein_g_target", "carbs_g_target", "fat_g_target", "fiber_g_target"]:
        val = getattr(payload, field)
        if val is not None:
            setattr(t, field, val)

    if payload.micronutrient_targets is not None:
        merged = {**ESSENTIAL_MICROS_DEFAULTS, **payload.micronutrient_targets}
        t.micronutrient_targets = merged

    db.commit()
    db.refresh(t)

    return NutritionTargetsResponse(
        calories_target=float(t.calories_target or 0),
        protein_g_target=float(t.protein_g_target or 0),
        carbs_g_target=float(t.carbs_g_target or 0),
        fat_g_target=float(t.fat_g_target or 0),
        fiber_g_target=float(t.fiber_g_target or 0),
        micronutrient_targets=t.micronutrient_targets or ESSENTIAL_MICROS_DEFAULTS,
    )


@router.post("/logs", response_model=FoodLogResponse)
async def create_log(
    payload: FoodLogCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    day = _parse_date(payload.date)
    title, base_nutrition = _resolve_source_nutrition(db, payload)

    factor = max(0.1, float(payload.servings or 1.0)) * max(0.1, float(payload.quantity or 1.0))
    nutrition_snapshot = _scaled_nutrition(base_nutrition, factor)

    log = FoodLog(
        user_id=current_user.id,
        date=day,
        meal_type=payload.meal_type,
        source_type=payload.source_type,
        source_id=payload.source_id,
        title=payload.title or title,
        servings=payload.servings,
        quantity=payload.quantity,
        nutrition_snapshot=nutrition_snapshot,
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    _, _, daily_score, _ = _compute_daily(db, current_user.id, day)

    # ── Gamification hooks ──
    # +50 XP for logging a meal
    award_xp(db, current_user, 50, "meal_log")
    # Update nutrition streak based on new daily score
    update_nutrition_streak(db, current_user, daily_score, day)
    # Check achievements (food_log_count, nutrition_streak, tier achievements, etc.)
    check_achievements(db, current_user)

    return _serialize_log(log)


@router.get("/logs", response_model=list[FoodLogResponse])
async def list_logs(
    date_str: str | None = Query(default=None, alias="date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    day = _parse_date(date_str)
    logs = (
        db.query(FoodLog)
        .filter(FoodLog.user_id == current_user.id, FoodLog.date == day)
        .order_by(FoodLog.created_at.asc())
        .all()
    )
    return [_serialize_log(x) for x in logs]


@router.patch("/logs/{log_id}", response_model=FoodLogResponse)
async def update_log(
    log_id: str,
    payload: FoodLogUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = db.query(FoodLog).filter(FoodLog.id == log_id, FoodLog.user_id == current_user.id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")

    if payload.meal_type is not None:
        log.meal_type = payload.meal_type
    if payload.title is not None:
        log.title = payload.title
    if payload.servings is not None:
        log.servings = payload.servings
    if payload.quantity is not None:
        log.quantity = payload.quantity

    if payload.nutrition is not None:
        factor = max(0.1, float(log.servings or 1.0)) * max(0.1, float(log.quantity or 1.0))
        log.nutrition_snapshot = _scaled_nutrition(payload.nutrition, factor)

    db.commit()
    db.refresh(log)

    _compute_daily(db, current_user.id, log.date)

    return _serialize_log(log)


@router.delete("/logs/{log_id}")
async def delete_log(
    log_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = db.query(FoodLog).filter(FoodLog.id == log_id, FoodLog.user_id == current_user.id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")

    day = log.date
    db.delete(log)
    db.commit()

    _compute_daily(db, current_user.id, day)

    return {"ok": True}


@router.get("/daily", response_model=DailyNutritionResponse)
async def get_daily(
    date_str: str | None = Query(default=None, alias="date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    day = _parse_date(date_str)
    totals, comparison, score, logs = _compute_daily(db, current_user.id, day)

    return DailyNutritionResponse(
        date=day.isoformat(),
        totals=totals,
        comparison=comparison,
        daily_score=score,
        logs=[_serialize_log(x) for x in logs],
    )


@router.get("/gaps")
async def get_nutrition_gaps(
    date_str: str | None = Query(default=None, alias="date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    day = _parse_date(date_str)
    _, comparison, _, _ = _compute_daily(db, current_user.id, day)

    low_items: list[dict] = []
    for key, values in comparison.items():
        if key == "calories":
            continue
        pct = float(values.get("pct", 0) or 0)
        if pct < 70:
            low_items.append({
                "key": key,
                "pct": round(pct, 1),
                "consumed": float(values.get("consumed", 0) or 0),
                "target": float(values.get("target", 0) or 0),
                "gap": max(0.0, float(values.get("target", 0) or 0) - float(values.get("consumed", 0) or 0)),
            })

    low_items = sorted(low_items, key=lambda x: x["pct"])[:4]

    gap_to_recipe_hint = {
        "protein": ["high-protein", "muscle_recovery"],
        "fiber": ["gut_health"],
        "vitamin_c_mg": ["immune_support"],
        "iron_mg": ["energy_boost"],
        "magnesium_mg": ["muscle_recovery"],
        "potassium_mg": ["heart_health"],
        "omega3_g": ["brain_health", "heart_health"],
        "calcium_mg": ["bone_health"],
        "vitamin_d_mcg": ["immune_support", "bone_health"],
        "vitamin_b12_mcg": ["energy_boost", "brain_health"],
    }

    gap_to_foods = {
        "protein": ["Greek Yogurt", "Chicken Breast", "Lentils"],
        "fiber": ["Chia Seeds", "Black Beans", "Raspberries"],
        "vitamin_c_mg": ["Red Bell Pepper", "Kiwi", "Orange"],
        "iron_mg": ["Spinach", "Lentils", "Pumpkin Seeds"],
        "magnesium_mg": ["Pumpkin Seeds", "Almonds", "Avocado"],
        "potassium_mg": ["Banana", "Potato", "Coconut Water"],
        "omega3_g": ["Salmon", "Sardines", "Chia Seeds"],
        "calcium_mg": ["Sardines", "Yogurt", "Kale"],
        "vitamin_d_mcg": ["Salmon", "Egg Yolk", "Mushrooms UV-exposed"],
        "vitamin_b12_mcg": ["Salmon", "Eggs", "Greek Yogurt"],
    }

    # Seed missing local foods so coach can recommend individual foods from local DB.
    default_food_profiles = {
        "Greek Yogurt": {"protein": 17, "calories": 100, "calcium_mg": 180},
        "Chicken Breast": {"protein": 31, "calories": 165},
        "Lentils": {"protein": 9, "fiber": 8, "iron_mg": 3.3},
        "Chia Seeds": {"fiber": 10, "omega3_g": 5, "protein": 5},
        "Black Beans": {"fiber": 8, "protein": 8, "iron_mg": 2.1},
        "Raspberries": {"fiber": 8, "vitamin_c_mg": 26, "calories": 64},
        "Red Bell Pepper": {"vitamin_c_mg": 95, "fiber": 2},
        "Kiwi": {"vitamin_c_mg": 64, "fiber": 3},
        "Orange": {"vitamin_c_mg": 70, "fiber": 3},
        "Spinach": {"iron_mg": 2.7, "magnesium_mg": 79},
        "Pumpkin Seeds": {"magnesium_mg": 150, "iron_mg": 2.5, "protein": 8},
        "Almonds": {"magnesium_mg": 80, "fiber": 3.5},
        "Avocado": {"potassium_mg": 485, "fiber": 7},
        "Banana": {"potassium_mg": 422, "vitamin_b6_mg": 0.4},
        "Potato": {"potassium_mg": 620, "vitamin_c_mg": 19},
        "Coconut Water": {"potassium_mg": 470, "calories": 45},
        "Salmon": {"omega3_g": 2.2, "protein": 22, "vitamin_d_mcg": 11},
        "Sardines": {"omega3_g": 1.5, "calcium_mg": 325, "vitamin_b12_mcg": 8.9},
        "Yogurt": {"calcium_mg": 200, "protein": 10},
        "Kale": {"calcium_mg": 150, "vitamin_c_mg": 80},
        "Egg Yolk": {"vitamin_d_mcg": 1.1, "vitamin_b12_mcg": 0.3},
        "Mushrooms UV-exposed": {"vitamin_d_mcg": 10, "fiber": 1},
        "Eggs": {"protein": 6, "vitamin_b12_mcg": 0.5},
    }

    suggestions_meals: list[dict] = []
    suggestions_foods: list[dict] = []

    for gap in low_items:
        key = gap["key"]

        # Meal suggestions
        hint_tags = gap_to_recipe_hint.get(key, [])
        if hint_tags:
            all_recipes = db.query(Recipe).limit(180).all()
            filtered = [r for r in all_recipes if any(tag in (r.health_benefits or []) for tag in hint_tags)]
            if filtered:
                candidate_recipe = filtered[0]
                suggestions_meals.append({
                    "for": key,
                    "recipe_id": str(candidate_recipe.id),
                    "title": candidate_recipe.title,
                    "health_benefits": candidate_recipe.health_benefits or [],
                })

        # Food suggestions (ensuring they exist in local DB)
        for food_name in gap_to_foods.get(key, [])[:2]:
            row = db.query(LocalFood).filter(LocalFood.name == food_name).first()
            if not row:
                row = LocalFood(
                    name=food_name,
                    category="Coach Staples",
                    serving="1 serving",
                    nutrition_info=default_food_profiles.get(food_name, {}),
                    tags=["coach", key],
                )
                db.add(row)
                db.commit()
                db.refresh(row)

            suggestions_foods.append({
                "for": key,
                "food_id": f"local-{row.id}",
                "name": row.name,
                "category": row.category,
                "nutrition_info": row.nutrition_info or {},
            })

    return {
        "date": day.isoformat(),
        "low_nutrients": low_items,
        "suggestions": (suggestions_meals + suggestions_foods)[:8],
        "recommended_meals": suggestions_meals[:4],
        "recommended_foods": suggestions_foods[:6],
    }
