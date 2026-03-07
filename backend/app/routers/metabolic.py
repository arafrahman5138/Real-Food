"""
Metabolic Budget API router.

Endpoints for budget settings, onboarding profile, scores, streak, preview, and remaining budget.
"""
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.metabolic import MetabolicBudget, MetabolicScore, MetabolicStreak
from app.models.metabolic_profile import MetabolicProfile
from app.schemas.metabolic import (
    MetabolicBudgetResponse,
    MetabolicBudgetUpdate,
    MetabolicProfileCreate,
    MetabolicProfileResponse,
    MESScoreResponse,
    DailyMESResponse,
    MealMESResponse,
    ScoreHistoryEntry,
    MetabolicStreakResponse,
    MESPreviewRequest,
    MESPreviewResponse,
    RemainingBudgetResponse,
    MealSuggestionResponse,
    CompositeMESRequest,
    CompositeMESResponse,
)
from app.models.recipe import Recipe
from app.models.nutrition import FoodLog
from app.services.metabolic_engine import (
    get_or_create_budget,
    get_or_create_streak,
    compute_meal_mes,
    compute_daily_mes,
    remaining_budget,
    aggregate_daily_totals,
    recompute_daily_score,
    derive_target_weight_lb,
    derive_protein_target_g,
    derive_sugar_ceiling,
    to_display_score,
    display_tier,
    classify_meal_context,
    should_score_meal,
    load_budget_for_user,
    compute_mea_score,
    build_threshold_context,
    BASE_TIER_THRESHOLDS,
)
from app.schemas.metabolic import SubScores, WeightsUsed

router = APIRouter()


def build_threshold_context_from_computed(computed) -> dict | None:
    """Build threshold context from a ComputedBudget's tier_thresholds."""
    if not computed or not computed.tier_thresholds:
        return None
    base_optimal = BASE_TIER_THRESHOLDS["optimal"]
    shift = computed.tier_thresholds.get("optimal", base_optimal) - base_optimal
    if shift == 0:
        return {"shift": str(shift), "reason": "Default thresholds — no metabolic risk adjustments.", "leniency": "standard"}
    elif shift > 0:
        return {"shift": str(shift), "reason": "Metabolic risk detected — thresholds adjusted for your profile.", "leniency": "stricter"}
    else:
        return {"shift": str(shift), "reason": "Athletic profile — thresholds relaxed for metabolic fitness.", "leniency": "more_lenient"}


def _parse_date(value: str | None) -> date:
    if not value:
        return datetime.utcnow().date()
    try:
        return datetime.fromisoformat(value).date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")


def _score_from_db(s: MetabolicScore) -> MESScoreResponse:
    """Build MESScoreResponse from a DB MetabolicScore, including sub_scores from details_json."""
    details = s.details_json or {}
    sub = details.get("sub_scores")
    weights = details.get("weights_used")
    return MESScoreResponse(
        protein_score=s.protein_score,
        fiber_score=s.fiber_score,
        sugar_score=s.sugar_score,
        total_score=s.total_score,
        display_score=s.display_score or to_display_score(s.total_score),
        tier=s.tier,
        display_tier=s.display_tier or display_tier(to_display_score(s.total_score)),
        protein_g=s.protein_g,
        fiber_g=s.fiber_g,
        sugar_g=s.sugar_g,
        carbs_g=s.sugar_g,
        meal_mes=s.total_score,
        sub_scores=SubScores(**sub) if sub else None,
        weights_used=WeightsUsed(**weights) if weights else None,
        net_carbs_g=details.get("net_carbs_g"),
        fat_g=float(details.get("fat_g", 0) or 0) if details.get("fat_g") else None,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━ Budget ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/budget", response_model=MetabolicBudgetResponse)
async def get_budget(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    budget = get_or_create_budget(db, current_user.id)
    computed = load_budget_for_user(db, current_user.id)
    return _budget_response(budget, computed)


@router.put("/budget", response_model=MetabolicBudgetResponse)
async def update_budget(
    payload: MetabolicBudgetUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    budget = get_or_create_budget(db, current_user.id)
    for field in ("protein_target_g", "fiber_floor_g", "sugar_ceiling_g",
                   "weight_protein", "weight_fiber", "weight_sugar", "weight_fat"):
        val = getattr(payload, field, None)
        if val is not None:
            setattr(budget, field, val)
    db.commit()
    db.refresh(budget)
    computed = load_budget_for_user(db, current_user.id)
    return _budget_response(budget, computed)


def _budget_response(budget: MetabolicBudget, computed=None) -> MetabolicBudgetResponse:
    """Build budget response with both legacy and new fields."""
    return MetabolicBudgetResponse(
        protein_target_g=budget.protein_target_g,
        fiber_floor_g=budget.fiber_floor_g,
        sugar_ceiling_g=budget.sugar_ceiling_g,
        weight_protein=budget.weight_protein,
        weight_fiber=budget.weight_fiber,
        weight_sugar=budget.weight_sugar,
        carb_ceiling_g=computed.carb_ceiling_g if computed else budget.sugar_ceiling_g,
        fat_target_g=computed.fat_g if computed else 0,
        weight_fat=getattr(budget, "weight_fat", 0.15) or 0.15,
        weight_gis=computed.weights.gis if computed else 0.35,
        tdee=computed.tdee if computed else None,
        ism=computed.ism if computed else None,
        tier_thresholds=computed.tier_thresholds if computed else None,
        threshold_context=build_threshold_context_from_computed(computed) if computed else None,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━ Profile / Onboarding ━━━━━━━━━━━━━━━━━━

@router.post("/profile", response_model=MetabolicProfileResponse)
async def save_profile(
    payload: MetabolicProfileCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save (or update) onboarding biometrics and recalculate derived targets."""
    profile = db.query(MetabolicProfile).filter(MetabolicProfile.user_id == current_user.id).first()
    if not profile:
        profile = MetabolicProfile(user_id=current_user.id)
        db.add(profile)

    profile_fields = (
        "sex", "age", "height_cm", "height_ft", "height_in",
        "weight_lb", "body_fat_pct", "body_fat_method",
        "goal", "activity_level", "target_weight_lb",
        "insulin_resistant", "prediabetes", "type_2_diabetes",
        "fasting_glucose_mgdl", "hba1c_pct", "triglycerides_mgdl",
    )
    for field in profile_fields:
        val = getattr(payload, field, None)
        if val is not None:
            setattr(profile, field, val)

    # Auto-derive height_cm from height_ft/height_in if not explicitly provided
    if not profile.height_cm and profile.height_ft:
        h_in = (profile.height_ft * 12) + (profile.height_in or 0)
        profile.height_cm = round(h_in * 2.54, 1)

    # Derive targets
    p_dict = {
        "sex": profile.sex,
        "weight_lb": profile.weight_lb,
        "goal": profile.goal,
        "target_weight_lb": profile.target_weight_lb,
        "body_fat_pct": profile.body_fat_pct,
        "height_cm": profile.height_cm,
    }
    profile.target_weight_lb = derive_target_weight_lb(p_dict)
    profile.protein_target_g = derive_protein_target_g(p_dict)

    db.commit()
    db.refresh(profile)

    # Sync derived targets into the user's metabolic budget
    budget = get_or_create_budget(db, current_user.id)
    budget.protein_target_g = profile.protein_target_g
    budget.sugar_ceiling_g = derive_sugar_ceiling(p_dict)
    db.commit()

    return _profile_response(profile)


@router.get("/profile", response_model=MetabolicProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(MetabolicProfile).filter(MetabolicProfile.user_id == current_user.id).first()
    if not profile:
        return MetabolicProfileResponse()
    return _profile_response(profile)


@router.post("/profile/recalculate", response_model=MetabolicProfileResponse)
async def recalculate_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Recompute derived targets from existing profile data."""
    profile = db.query(MetabolicProfile).filter(MetabolicProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="No metabolic profile found. Complete onboarding first.")

    p_dict = {
        "sex": profile.sex,
        "weight_lb": profile.weight_lb,
        "goal": profile.goal,
        "target_weight_lb": profile.target_weight_lb,
        "body_fat_pct": profile.body_fat_pct,
        "height_cm": profile.height_cm,
    }
    profile.target_weight_lb = derive_target_weight_lb(p_dict)
    profile.protein_target_g = derive_protein_target_g(p_dict)
    db.commit()
    db.refresh(profile)

    budget = get_or_create_budget(db, current_user.id)
    budget.protein_target_g = profile.protein_target_g
    budget.sugar_ceiling_g = derive_sugar_ceiling(p_dict)
    db.commit()

    return _profile_response(profile)


def _profile_response(profile: MetabolicProfile) -> MetabolicProfileResponse:
    return MetabolicProfileResponse(
        sex=profile.sex,
        age=getattr(profile, "age", None),
        height_cm=profile.height_cm,
        height_ft=getattr(profile, "height_ft", None),
        height_in=getattr(profile, "height_in", None),
        weight_lb=profile.weight_lb,
        body_fat_pct=profile.body_fat_pct,
        body_fat_method=getattr(profile, "body_fat_method", None),
        goal=profile.goal,
        activity_level=profile.activity_level,
        target_weight_lb=profile.target_weight_lb,
        protein_target_g=profile.protein_target_g,
        insulin_resistant=getattr(profile, "insulin_resistant", None),
        prediabetes=getattr(profile, "prediabetes", None),
        type_2_diabetes=getattr(profile, "type_2_diabetes", None),
        fasting_glucose_mgdl=getattr(profile, "fasting_glucose_mgdl", None),
        hba1c_pct=getattr(profile, "hba1c_pct", None),
        triglycerides_mgdl=getattr(profile, "triglycerides_mgdl", None),
        onboarding_step_completed=getattr(profile, "onboarding_step_completed", None),
    )


@router.patch("/profile", response_model=MetabolicProfileResponse)
async def patch_profile(
    payload: MetabolicProfileCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Partial update of metabolic profile (used from Settings page)."""
    profile = db.query(MetabolicProfile).filter(MetabolicProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="No metabolic profile found. Complete onboarding first.")

    profile_fields = (
        "sex", "age", "height_cm", "height_ft", "height_in",
        "weight_lb", "body_fat_pct", "body_fat_method",
        "goal", "activity_level", "target_weight_lb",
        "insulin_resistant", "prediabetes", "type_2_diabetes",
        "fasting_glucose_mgdl", "hba1c_pct", "triglycerides_mgdl",
        "onboarding_step_completed",
    )
    for field in profile_fields:
        val = getattr(payload, field, None)
        if val is not None:
            setattr(profile, field, val)

    # Auto-derive height_cm from height_ft/height_in if not explicitly provided
    if profile.height_ft:
        h_in = (profile.height_ft * 12) + (profile.height_in or 0)
        profile.height_cm = round(h_in * 2.54, 1)

    # Derive targets
    p_dict = {
        "sex": profile.sex,
        "weight_lb": profile.weight_lb,
        "goal": profile.goal,
        "target_weight_lb": profile.target_weight_lb,
        "body_fat_pct": profile.body_fat_pct,
        "height_cm": profile.height_cm,
    }
    profile.target_weight_lb = derive_target_weight_lb(p_dict)
    profile.protein_target_g = derive_protein_target_g(p_dict)

    db.commit()
    db.refresh(profile)

    # Sync derived targets into the user's metabolic budget
    budget = get_or_create_budget(db, current_user.id)
    budget.protein_target_g = profile.protein_target_g
    budget.sugar_ceiling_g = derive_sugar_ceiling(p_dict)
    db.commit()

    return _profile_response(profile)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━ Scores ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/score/daily", response_model=DailyMESResponse)
async def get_daily_score(
    date_str: str | None = Query(default=None, alias="date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    day = _parse_date(date_str)
    budget = get_or_create_budget(db, current_user.id)

    # Ensure score is up to date
    daily = recompute_daily_score(db, current_user.id, day, budget)
    totals = aggregate_daily_totals(db, current_user.id, day)
    rem = remaining_budget(totals, budget)
    details = daily.details_json or {}
    treat_impact = details.get("treat_impact") if isinstance(details, dict) else None

    # Compute MEA score
    computed = load_budget_for_user(db, current_user.id)
    mea = None
    if computed and totals.get("calories", 0) > 0:
        mea = compute_mea_score(
            consumed_kcal=totals.get("calories", 0),
            protein_g=totals.get("protein_g", 0),
            carbs_g=totals.get("carbs_g", 0),
            fat_g=totals.get("fat_g", 0),
            daily_mes=daily.total_score,
            budget=computed,
        )

    return DailyMESResponse(
        date=day.isoformat(),
        score=_score_from_db(daily),
        remaining=rem,
        treat_impact=treat_impact,
        mea=mea,
    )


@router.get("/score/meals", response_model=list[MealMESResponse])
async def get_meal_scores(
    date_str: str | None = Query(default=None, alias="date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    day = _parse_date(date_str)
    scores = (
        db.query(MetabolicScore)
        .filter(
            MetabolicScore.user_id == current_user.id,
            MetabolicScore.date == day,
            MetabolicScore.scope == "meal",
        )
        .order_by(MetabolicScore.created_at.asc())
        .all()
    )
    results = []
    for s in scores:
        # Try to get meal title and meal_type from the linked food log
        title = None
        meal_type = None
        if s.food_log:
            title = s.food_log.title
            meal_type = s.food_log.meal_type
        ctx = s.meal_context or "full_meal"
        details = s.details_json or {}

        # Unscored items (components, desserts, sauces) — no score card
        if ctx != "full_meal" and ctx != "daily" and s.total_score == 0:
            results.append(MealMESResponse(
                food_log_id=s.food_log_id,
                title=title,
                score=None,
                meal_context=ctx,
                meal_type=meal_type,
                unscored_hint=details.get("unscored_reason", ""),
            ))
            continue

        results.append(MealMESResponse(
            food_log_id=s.food_log_id,
            title=title,
            score=_score_from_db(s),
            meal_context=ctx,
            meal_type=meal_type,
        ))
    return results


@router.get("/score/history", response_model=list[ScoreHistoryEntry])
async def get_score_history(
    days: int = Query(default=14, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = datetime.utcnow().date()
    start = today - timedelta(days=days - 1)
    scores = (
        db.query(MetabolicScore)
        .filter(
            MetabolicScore.user_id == current_user.id,
            MetabolicScore.scope == "daily",
            MetabolicScore.date >= start,
            MetabolicScore.date <= today,
        )
        .order_by(MetabolicScore.date.asc())
        .all()
    )
    return [
        ScoreHistoryEntry(
            date=s.date.isoformat(),
            total_score=s.total_score,
            display_score=s.display_score or to_display_score(s.total_score),
            tier=s.tier,
            display_tier=s.display_tier or display_tier(to_display_score(s.total_score)),
        )
        for s in scores
    ]


@router.post("/score/preview", response_model=MESPreviewResponse)
async def preview_meal_score(
    payload: MESPreviewRequest,
    date_str: str | None = Query(default=None, alias="date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Preview MES for a hypothetical meal and its impact on daily score."""
    budget = get_or_create_budget(db, current_user.id)
    day = _parse_date(date_str)

    # Meal score
    effective_carbs = payload.carbs_g or payload.sugar_g
    nutrition = {
        "protein_g": payload.protein_g,
        "fiber_g": payload.fiber_g,
        "carbs_g": effective_carbs,
        "sugar_g": payload.sugar_g,
        "fat_g": payload.fat_g,
    }
    meal_result = compute_meal_mes(nutrition, budget)
    meal_score = MESScoreResponse(**meal_result)

    # Projected daily: current totals + this meal
    totals = aggregate_daily_totals(db, current_user.id, day)
    projected_totals = {
        "protein_g": totals["protein_g"] + payload.protein_g,
        "fiber_g": totals["fiber_g"] + payload.fiber_g,
        "carbs_g": totals.get("carbs_g", totals["sugar_g"]) + effective_carbs,
        "sugar_g": totals["sugar_g"] + effective_carbs,
    }
    daily_result = compute_daily_mes(projected_totals, budget)
    daily_score = MESScoreResponse(**daily_result)

    return MESPreviewResponse(meal_score=meal_score, projected_daily=daily_score)


# ━━━━━━━━━━━━━━━━━━━━━━━━ Composite MES ━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/score/composite", response_model=CompositeMESResponse)
async def compute_composite_score(
    payload: CompositeMESRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Compute combined MES for multiple food logs treated as one meal.

    Used when grouping meal-prep components (e.g. protein + carb + veg)
    into a single composite meal event for scoring.
    """
    if not payload.food_log_ids:
        raise HTTPException(status_code=400, detail="food_log_ids must not be empty")

    logs = (
        db.query(FoodLog)
        .filter(
            FoodLog.id.in_(payload.food_log_ids),
            FoodLog.user_id == current_user.id,
        )
        .all()
    )

    if not logs:
        raise HTTPException(status_code=404, detail="No matching food logs found")

    # Aggregate nutrition from all component logs
    agg = {"protein_g": 0.0, "fiber_g": 0.0, "carbs_g": 0.0, "sugar_g": 0.0, "calories": 0.0, "fat_g": 0.0}
    for log in logs:
        snap = log.nutrition_snapshot or {}
        agg["protein_g"] += float(snap.get("protein", 0) or snap.get("protein_g", 0) or 0)
        agg["fiber_g"] += float(snap.get("fiber", 0) or snap.get("fiber_g", 0) or 0)
        agg["carbs_g"] += float(
            snap.get("carbs", 0) or snap.get("carbs_g", 0)
            or snap.get("sugar", 0) or snap.get("sugar_g", 0) or 0
        )
        agg["sugar_g"] += float(snap.get("sugar", 0) or snap.get("sugar_g", 0) or 0)
        agg["calories"] += float(snap.get("calories", 0) or 0)
        agg["fat_g"] += float(snap.get("fat", 0) or snap.get("fat_g", 0) or 0)

    budget = get_or_create_budget(db, current_user.id)
    result = compute_meal_mes(agg, budget)

    return CompositeMESResponse(
        score=MESScoreResponse(**result),
        component_count=len(logs),
        total_calories=round(agg["calories"], 1),
        total_protein_g=round(agg["protein_g"], 1),
        total_carbs_g=round(agg["carbs_g"], 1),
        total_fat_g=round(agg["fat_g"], 1),
        total_fiber_g=round(agg["fiber_g"], 1),
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━ Streak ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/streak", response_model=MetabolicStreakResponse)
async def get_streak(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    streak = get_or_create_streak(db, current_user.id)
    return MetabolicStreakResponse(
        current_streak=streak.current_streak,
        longest_streak=streak.longest_streak,
        threshold=streak.threshold,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━ Remaining Budget ━━━━━━━━━━━━━━━━━━━━━━

@router.get("/remaining-budget", response_model=RemainingBudgetResponse)
async def get_remaining_budget(
    date_str: str | None = Query(default=None, alias="date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    day = _parse_date(date_str)
    budget = get_or_create_budget(db, current_user.id)
    totals = aggregate_daily_totals(db, current_user.id, day)
    rem = remaining_budget(totals, budget)
    return RemainingBudgetResponse(**rem)


# ━━━━━━━━━━━━━━━━━━━━━━━━ Meal Suggestions ━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/meal-suggestions", response_model=list[MealSuggestionResponse])
async def get_meal_suggestions(
    date_str: str | None = Query(default=None, alias="date"),
    limit: int = Query(default=10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return recipes that fit the user's remaining energy budget.
    Scores each recipe against the remaining budget and returns those
    that would keep the user in 'stable' or 'optimal' territory.
    """
    day = _parse_date(date_str)
    budget = get_or_create_budget(db, current_user.id)
    totals = aggregate_daily_totals(db, current_user.id, day)
    rem = remaining_budget(totals, budget)

    # Fetch all recipes
    recipes = db.query(Recipe).limit(200).all()

    suggestions: list[dict] = []
    for recipe in recipes:
        nutrition = recipe.nutrition_info or {}
        protein_g = float(nutrition.get("protein", 0) or nutrition.get("protein_g", 0) or 0)
        fiber_g = float(nutrition.get("fiber", 0) or nutrition.get("fiber_g", 0) or 0)
        carbs_g = float(nutrition.get("carbs", 0) or nutrition.get("carbs_g", 0) or nutrition.get("sugar", 0) or nutrition.get("sugar_g", 0) or 0)

        # Compute what daily totals would look like with this meal added
        projected_totals = {
            "protein_g": totals["protein_g"] + protein_g,
            "fiber_g": totals["fiber_g"] + fiber_g,
            "carbs_g": totals.get("carbs_g", totals["sugar_g"]) + carbs_g,
            "sugar_g": totals["sugar_g"] + carbs_g,
        }
        daily_result = compute_daily_mes(projected_totals, budget)
        meal_result = compute_meal_mes(nutrition, budget)

        # Only suggest meals that keep the user at stable (60+) or better
        if daily_result["total_score"] >= 60:
            suggestions.append({
                "recipe_id": recipe.id,
                "title": recipe.title,
                "description": recipe.description,
                "meal_score": meal_result["total_score"],
                "meal_tier": meal_result["tier"],
                "projected_daily_score": daily_result["total_score"],
                "projected_daily_tier": daily_result["tier"],
                "protein_g": protein_g,
                "fiber_g": fiber_g,
                "sugar_g": carbs_g,
                "calories": float(nutrition.get("calories", 0) or 0),
                "cuisine": recipe.cuisine,
                "total_time_min": recipe.total_time_min,
            })

    # Sort by projected daily score descending
    suggestions.sort(key=lambda s: s["projected_daily_score"], reverse=True)
    return suggestions[:limit]


# ━━━━━━━━━━━━━━━━━━━━ Pairing Suggestions ━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/pairings/suggestions")
async def get_pairing_suggestions(
    recipe_id: str = Query(..., description="Source recipe ID to find pairings for"),
    limit: int = Query(5, ge=1, le=20),
    side_type: str | None = Query(None, description="Filter by side type: veg_side, carb_base, protein_base, sauce"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return side / pairing suggestions for a recipe, sorted by MES improvement.

    If the source recipe has `default_pairing_ids`, those are returned first.
    Then additional suggestions are ranked by MES delta (how much they improve
    the combined MES when added to the source recipe).
    """
    source = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Recipe not found")

    source_role = getattr(source, 'recipe_role', None) or 'full_meal'
    source_is_component = bool(getattr(source, 'is_component', False))
    source_needs_default_pairing = getattr(source, 'needs_default_pairing', None) is True

    if source_role == 'full_meal' and not source_is_component and not source_needs_default_pairing:
        return []

    budget = get_or_create_budget(db, current_user.id)
    source_nutrition = source.nutrition_info or {}
    source_mes = compute_meal_mes(source_nutrition, budget)

    # Gather candidates: components and sides
    candidates_q = db.query(Recipe).filter(Recipe.id != recipe_id)
    if side_type:
        candidates_q = candidates_q.filter(Recipe.recipe_role == side_type)
    else:
        # Default: look for veg_side, carb_base, protein_base, sauce
        candidates_q = candidates_q.filter(
            Recipe.recipe_role.in_(["veg_side", "carb_base", "protein_base", "sauce"])
        )
    candidates = candidates_q.limit(200).all()

    # Also get explicitly linked pairings
    default_ids = getattr(source, 'default_pairing_ids', None) or []
    default_recipes = {}
    if default_ids:
        defaults = db.query(Recipe).filter(Recipe.id.in_(default_ids)).all()
        default_recipes = {str(r.id): r for r in defaults}

    # Pick one primary default pairing for cleaner UX in the client.
    # Prefer true sides over another protein when a full meal has multiple defaults.
    preferred_default_id = None
    if default_recipes:
        role_priority = ["veg_side", "carb_base", "sauce", "dessert", "protein_base", "full_meal"]
        ordered_defaults = sorted(
            default_recipes.values(),
            key=lambda r: (
                role_priority.index(getattr(r, 'recipe_role', None) or "full_meal")
                if (getattr(r, 'recipe_role', None) or "full_meal") in role_priority
                else len(role_priority)
            )
        )
        preferred_default_id = str(ordered_defaults[0].id)

    results = []
    for candidate in candidates:
        c_nutrition = candidate.nutrition_info or {}
        # Combine source + candidate nutrition
        combined = {}
        for key in ("protein", "protein_g", "fiber", "fiber_g", "carbs", "carbs_g",
                     "sugar", "sugar_g", "calories", "fat", "fat_g"):
            combined[key] = float(source_nutrition.get(key, 0) or 0) + float(c_nutrition.get(key, 0) or 0)

        combined_mes = compute_meal_mes(combined, budget)
        delta = combined_mes["total_score"] - source_mes["total_score"]

        results.append({
            "recipe_id": str(candidate.id),
            "title": candidate.title,
            "recipe_role": getattr(candidate, 'recipe_role', 'full_meal') or 'full_meal',
            "cuisine": candidate.cuisine,
            "total_time_min": candidate.total_time_min or 0,
            "nutrition_info": c_nutrition,
            "combined_mes_score": round(combined_mes["total_score"], 1),
            "combined_display_score": round(to_display_score(combined_mes["total_score"]), 1),
            "combined_tier": display_tier(to_display_score(combined_mes["total_score"])),
            "mes_delta": round(delta, 1),
            "is_default_pairing": str(candidate.id) == preferred_default_id,
        })

    # Sort: defaults first, then by MES delta descending
    results.sort(key=lambda r: (not r["is_default_pairing"], -r["mes_delta"]))
    return results[:limit]


# ━━━━━━━━━━━━━━━ Composite MES Preview (by recipe IDs) ━━━━━━━━━━━━

@router.post("/score/preview-composite")
async def preview_composite_score(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Preview combined MES for a set of recipes (before logging).

    Body: { "recipe_ids": ["id1", "id2", ...], "servings": [1, 1, ...] }
    """
    recipe_ids = payload.get("recipe_ids", [])
    servings_list = payload.get("servings", [1.0] * len(recipe_ids))

    if not recipe_ids:
        raise HTTPException(status_code=400, detail="recipe_ids must not be empty")

    recipes = db.query(Recipe).filter(Recipe.id.in_(recipe_ids)).all()
    recipe_map = {str(r.id): r for r in recipes}

    agg = {"protein_g": 0.0, "fiber_g": 0.0, "carbs_g": 0.0, "sugar_g": 0.0, "calories": 0.0, "fat_g": 0.0}
    for i, rid in enumerate(recipe_ids):
        r = recipe_map.get(rid)
        if not r:
            continue
        n = r.nutrition_info or {}
        s = float(servings_list[i]) if i < len(servings_list) else 1.0
        agg["protein_g"] += float(n.get("protein", 0) or n.get("protein_g", 0) or 0) * s
        agg["fiber_g"] += float(n.get("fiber", 0) or n.get("fiber_g", 0) or 0) * s
        agg["carbs_g"] += float(n.get("carbs", 0) or n.get("carbs_g", 0) or 0) * s
        agg["sugar_g"] += float(n.get("sugar", 0) or n.get("sugar_g", 0) or 0) * s
        agg["calories"] += float(n.get("calories", 0) or 0) * s
        agg["fat_g"] += float(n.get("fat", 0) or n.get("fat_g", 0) or 0) * s

    budget = get_or_create_budget(db, current_user.id)
    result = compute_meal_mes(agg, budget)

    return {
        "score": result,
        "display_score": round(to_display_score(result["total_score"]), 1),
        "display_tier": display_tier(to_display_score(result["total_score"])),
        "component_count": len(recipes),
        "total_calories": round(agg["calories"], 1),
        "total_protein_g": round(agg["protein_g"], 1),
        "total_carbs_g": round(agg["carbs_g"], 1),
        "total_fat_g": round(agg["fat_g"], 1),
        "total_fiber_g": round(agg["fiber_g"], 1),
    }
