import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, timedelta
from typing import List
from app.db import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.meal_plan import MealPlan, MealPlanItem
from app.schemas.meal_plan import (
    MealPlanGenerate,
    MealPlanResponse,
    MealPlanItemResponse,
    MealPlanQualitySummary,
    MealPlanPrepEntry,
    MealPlanShortlistRequest,
    MealPlanShortlistResponse,
    MealPlanReplacementOptionsResponse,
    MealPlanReplacementOption,
    MealPlanReplaceRequest,
)
from app.agents.meal_planner_fallback import (
    TARGET_DISPLAY_MES,
    generate_fallback_meal_plan,
    get_replacement_candidates,
    get_shortlist_candidates,
)
from app.services.metabolic_engine import compute_meal_mes, get_or_create_budget

router = APIRouter()
logger = logging.getLogger(__name__)
WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _meal_item_response(item: MealPlanItem, budget) -> MealPlanItemResponse:
    recipe_data = dict(item.recipe_data or {})
    if "mes_display_score" not in recipe_data:
        nutrition = recipe_data.get("nutrition_estimate") or recipe_data.get("nutrition_info") or {}
        mes = compute_meal_mes(nutrition, budget)
        recipe_data["mes_display_score"] = mes.get("display_score", 0)
        recipe_data["mes_display_tier"] = mes.get("display_tier", "crash_risk")
        recipe_data["meets_mes_target"] = float(recipe_data["mes_display_score"] or 0) >= TARGET_DISPLAY_MES

    return MealPlanItemResponse(
        id=str(item.id),
        day_of_week=item.day_of_week,
        meal_type=item.meal_type,
        meal_category=item.meal_category,
        is_bulk_cook=item.is_bulk_cook,
        servings=item.servings,
        recipe_data=recipe_data,
    )


def _build_quality_summary(items: list[MealPlanItemResponse]) -> tuple[MealPlanQualitySummary, list[str]]:
    daily_scores: dict[str, list[float]] = {day: [] for day in WEEK_DAYS}
    qualifying_meals = 0
    warnings: list[str] = []

    for item in items:
        score = float((item.recipe_data or {}).get("mes_display_score", 0) or 0)
        daily_scores.setdefault(item.day_of_week, []).append(score)
        if score >= TARGET_DISPLAY_MES:
            qualifying_meals += 1

    ordered_daily_averages = []
    for day_scores in daily_scores.values():
        avg = round(sum(day_scores) / len(day_scores), 1) if day_scores else 0.0
        ordered_daily_averages.append(avg)

    days_meeting_target = sum(1 for avg in ordered_daily_averages if avg >= TARGET_DISPLAY_MES)
    weekly_average = round(sum(ordered_daily_averages) / len(ordered_daily_averages), 1) if ordered_daily_averages else 0.0

    summary = MealPlanQualitySummary(
        target_meal_display_mes=TARGET_DISPLAY_MES,
        target_daily_average_display_mes=TARGET_DISPLAY_MES,
        actual_weekly_average_daily_display_mes=weekly_average,
        qualifying_meal_count=qualifying_meals,
        total_meal_count=len(items),
        days_meeting_target=days_meeting_target,
        total_days=len(WEEK_DAYS),
    )

    if qualifying_meals < len(items):
        warnings.append("Some meal slots could not reach the 70+ MES target with the current recipe library.")
    if days_meeting_target < len(WEEK_DAYS):
        warnings.append("Some days fell below the 70+ average MES target; best available meals were used.")

    return summary, warnings


def _build_prep_timeline(items: list[MealPlanItemResponse]) -> list[MealPlanPrepEntry]:
    order_map = {day: index for index, day in enumerate(WEEK_DAYS)}
    grouped: dict[str, dict] = {}

    for item in items:
        recipe_data = item.recipe_data or {}
        prep_group_id = recipe_data.get("prep_group_id")
        if not prep_group_id:
            continue

        entry = grouped.setdefault(
            prep_group_id,
            {
                "prep_group_id": prep_group_id,
                "recipe_id": recipe_data.get("id", ""),
                "recipe_title": recipe_data.get("title", item.meal_type.title()),
                "meal_type": item.meal_type,
                "prep_day": recipe_data.get("prep_day", ""),
                "covers_days": [],
                "servings_to_make": 0,
            },
        )
        entry["covers_days"].append(item.day_of_week)
        entry["servings_to_make"] += int(item.servings or 0)

    timeline: list[MealPlanPrepEntry] = []
    for entry in grouped.values():
        covers_days = sorted(set(entry["covers_days"]), key=lambda day: order_map.get(day, 999))
        meal_label = {
            "breakfast": "breakfasts",
            "lunch": "lunches",
            "dinner": "dinners",
        }.get(entry["meal_type"], entry["meal_type"])
        day_range = covers_days[0] if len(covers_days) == 1 else f"{covers_days[0]}-{covers_days[-1]}"
        timeline.append(
            MealPlanPrepEntry(
                prep_group_id=entry["prep_group_id"],
                recipe_id=entry["recipe_id"],
                recipe_title=entry["recipe_title"],
                meal_type=entry["meal_type"],
                prep_day=entry["prep_day"],
                covers_days=covers_days,
                servings_to_make=entry["servings_to_make"],
                summary_text=f"Prep {entry['prep_day']}: {entry['recipe_title']} for {day_range} {meal_label}",
            )
        )

    timeline.sort(
        key=lambda item: (
            {"Sunday": 0, "Wednesday": 1, "Saturday": 2}.get(item.prep_day, 99),
            order_map.get(item.covers_days[0], 999) if item.covers_days else 999,
        )
    )
    return timeline


def _serialize_plan(plan: MealPlan, budget, extra_warnings: list[str] | None = None) -> MealPlanResponse:
    items = [_meal_item_response(item, budget) for item in plan.items]
    quality_summary, warnings = _build_quality_summary(items)
    prep_timeline = _build_prep_timeline(items)
    persisted_warnings = []
    if isinstance(plan.preferences_snapshot, dict):
        persisted_warnings = plan.preferences_snapshot.get("generation_warnings") or []
    all_warnings = list(dict.fromkeys([*(persisted_warnings or []), *(extra_warnings or []), *warnings]))
    return MealPlanResponse(
        id=str(plan.id),
        week_start=plan.week_start.isoformat(),
        items=items,
        created_at=plan.created_at.isoformat(),
        quality_summary=quality_summary,
        prep_timeline=prep_timeline,
        warnings=all_warnings,
    )


def _default_preferences_from_user(current_user: User):
    from app.schemas.meal_plan import MealPlanPreferences

    return MealPlanPreferences(
        flavor_preferences=current_user.flavor_preferences or [],
        dietary_restrictions=current_user.dietary_preferences or [],
        allergies=current_user.allergies or [],
        liked_ingredients=current_user.liked_ingredients or [],
        disliked_ingredients=current_user.disliked_ingredients or [],
        protein_preferences=current_user.protein_preferences or {},
        cooking_time_budget=current_user.cooking_time_budget or {"quick": 4, "medium": 2, "long": 1},
        household_size=current_user.household_size,
        budget_level=current_user.budget_level,
        variety_mode="balanced",
    )


@router.post("/shortlist", response_model=MealPlanShortlistResponse)
async def get_meal_plan_shortlist(
    request: MealPlanShortlistRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    preferences = request.preferences or _default_preferences_from_user(current_user)
    return get_shortlist_candidates(db, preferences.model_dump(), str(current_user.id), per_slot=4)


@router.post("/generate", response_model=MealPlanResponse)
async def generate_meal_plan(
    request: MealPlanGenerate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    week_start = request.week_start or (date.today() - timedelta(days=date.today().weekday()))

    preferences = request.preferences or _default_preferences_from_user(current_user)

    prefs_dict = preferences.model_dump()

    result = generate_fallback_meal_plan(db, prefs_dict, str(current_user.id))
    budget = get_or_create_budget(db, current_user.id)

    meal_plan = MealPlan(
        user_id=current_user.id,
        week_start=week_start,
        preferences_snapshot={
            **prefs_dict,
            "generation_warnings": result.get("warnings", []),
            "prep_timeline": result.get("prep_timeline", []),
        },
    )
    db.add(meal_plan)
    db.flush()

    for day_data in result.get("days", []):
        for meal_data in day_data.get("meals", []):
            recipe_data = meal_data.get("recipe", {})

            item = MealPlanItem(
                meal_plan_id=meal_plan.id,
                day_of_week=day_data["day"],
                meal_type=meal_data["meal_type"],
                meal_category=meal_data.get("category", "quick"),
                is_bulk_cook=meal_data.get("is_bulk_cook", False),
                servings=meal_data.get("servings", preferences.household_size),
                recipe_id=recipe_data.get("id"),
                recipe_data=recipe_data,
            )
            db.add(item)

    db.commit()
    db.refresh(meal_plan)
    return _serialize_plan(meal_plan, budget, result.get("warnings", []))


@router.get("/items/{item_id}/alternatives", response_model=MealPlanReplacementOptionsResponse)
async def get_meal_plan_item_alternatives(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(MealPlanItem)
        .join(MealPlan, MealPlan.id == MealPlanItem.meal_plan_id)
        .filter(MealPlanItem.id == item_id, MealPlan.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Meal plan item not found")

    preferences = item.meal_plan.preferences_snapshot or {}
    alternatives = get_replacement_candidates(
        db=db,
        preferences=preferences,
        meal_type=item.meal_type,
        user_id=str(current_user.id),
        exclude_recipe_ids={str(item.recipe_id)} if item.recipe_id else set(),
        limit=5,
    )

    options = [
        MealPlanReplacementOption(
            recipe_id=str(candidate["recipe"].id),
            title=candidate["recipe"].title,
            description=candidate["recipe"].description or "",
            total_time_min=(candidate["recipe"].total_time_min or 0) or ((candidate["recipe"].prep_time_min or 0) + (candidate["recipe"].cook_time_min or 0)),
            difficulty=candidate["recipe"].difficulty or "easy",
            mes_display_score=float(candidate["mes"].get("display_score", 0) or 0),
            mes_display_tier=candidate["mes"].get("display_tier", "critical"),
        )
        for candidate in alternatives
    ]
    return MealPlanReplacementOptionsResponse(item_id=item_id, meal_type=item.meal_type, options=options)


def _replacement_category(day_of_week: str, meal_type: str) -> str:
    if meal_type == "breakfast":
        return "quick"
    if meal_type == "dinner" and day_of_week in ("Saturday", "Sunday"):
        return "sit_down"
    return "quick"


@router.post("/items/{item_id}/replace", response_model=MealPlanResponse)
async def replace_meal_plan_item(
    item_id: str,
    request: MealPlanReplaceRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(MealPlanItem)
        .join(MealPlan, MealPlan.id == MealPlanItem.meal_plan_id)
        .filter(MealPlanItem.id == item_id, MealPlan.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Meal plan item not found")

    alternatives = get_replacement_candidates(
        db=db,
        preferences=item.meal_plan.preferences_snapshot or {},
        meal_type=item.meal_type,
        user_id=str(current_user.id),
        exclude_recipe_ids={str(item.recipe_id)} if item.recipe_id else set(),
        limit=12,
    )
    replacement = next((candidate for candidate in alternatives if str(candidate["recipe"].id) == request.recipe_id), None)
    if not replacement:
        raise HTTPException(status_code=400, detail="Replacement recipe is not valid for this meal slot")

    recipe = replacement["recipe"]
    mes = replacement["mes"]
    item.recipe_id = recipe.id
    item.meal_category = _replacement_category(item.day_of_week, item.meal_type)
    item.is_bulk_cook = False
    item.recipe_data = {
        "id": str(recipe.id),
        "title": recipe.title,
        "description": recipe.description or "",
        "ingredients": recipe.ingredients or [],
        "steps": recipe.steps or [],
        "prep_time_min": recipe.prep_time_min or 0,
        "cook_time_min": recipe.cook_time_min or 0,
        "servings": recipe.servings or 1,
        "difficulty": recipe.difficulty or "easy",
        "flavor_profile": recipe.flavor_profile or [],
        "dietary_tags": recipe.dietary_tags or [],
        "nutrition_estimate": recipe.nutrition_info or {},
        "mes_display_score": float(mes.get("display_score", 0) or 0),
        "mes_display_tier": mes.get("display_tier", "critical"),
        "meets_mes_target": float(mes.get("display_score", 0) or 0) >= TARGET_DISPLAY_MES,
        "prep_group_id": None,
        "prep_day": None,
        "prep_label": None,
        "prep_window_start_day": None,
        "prep_window_end_day": None,
        "is_prep_day": False,
        "is_reheat": False,
        "repeat_index": 0,
        "prep_status": None,
    }
    db.commit()
    db.refresh(item.meal_plan)
    budget = get_or_create_budget(db, current_user.id)
    return _serialize_plan(item.meal_plan, budget)


@router.get("/current", response_model=MealPlanResponse)
async def get_current_plan(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = db.query(MealPlan).filter(
        MealPlan.user_id == current_user.id
    ).order_by(MealPlan.created_at.desc()).first()

    if not plan:
        raise HTTPException(status_code=404, detail="No meal plan found")

    budget = get_or_create_budget(db, current_user.id)
    return _serialize_plan(plan, budget)


@router.get("/history", response_model=List[MealPlanResponse])
async def get_plan_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plans = db.query(MealPlan).filter(
        MealPlan.user_id == current_user.id
    ).order_by(MealPlan.created_at.desc()).limit(10).all()
    budget = get_or_create_budget(db, current_user.id)

    return [_serialize_plan(plan, budget) for plan in plans]
