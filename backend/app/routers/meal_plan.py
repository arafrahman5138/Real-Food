import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, timedelta
from typing import List
from app.db import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.meal_plan import MealPlan, MealPlanItem
from app.schemas.meal_plan import MealPlanGenerate, MealPlanResponse, MealPlanItemResponse
from app.agents.meal_planner import generate_meal_plan_agent
from app.agents.meal_planner_fallback import generate_fallback_meal_plan

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/generate", response_model=MealPlanResponse)
async def generate_meal_plan(
    request: MealPlanGenerate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    week_start = request.week_start or (date.today() - timedelta(days=date.today().weekday()))

    preferences = request.preferences
    if not preferences:
        from app.schemas.meal_plan import MealPlanPreferences
        preferences = MealPlanPreferences(
            flavor_preferences=current_user.flavor_preferences or [],
            dietary_restrictions=current_user.dietary_preferences or [],
            allergies=current_user.allergies or [],
            cooking_time_budget=current_user.cooking_time_budget or {"quick": 4, "medium": 2, "long": 1},
            household_size=current_user.household_size,
            budget_level=current_user.budget_level,
        )

    prefs_dict = preferences.model_dump()

    # Try LLM first; on any failure fall back to seeded recipes
    try:
        result = await generate_meal_plan_agent(prefs_dict)
        if not result.get("days"):
            raise ValueError("LLM returned an empty plan")
    except Exception as exc:
        logger.warning("LLM meal plan generation failed (%s), using DB fallback.", exc)
        result = generate_fallback_meal_plan(db, prefs_dict)

    meal_plan = MealPlan(
        user_id=current_user.id,
        week_start=week_start,
        preferences_snapshot=prefs_dict,
    )
    db.add(meal_plan)
    db.flush()

    for day_data in result.get("days", []):
        for meal_data in day_data.get("meals", []):
            item = MealPlanItem(
                meal_plan_id=meal_plan.id,
                day_of_week=day_data["day"],
                meal_type=meal_data["meal_type"],
                meal_category=meal_data.get("category", "quick"),
                is_bulk_cook=meal_data.get("is_bulk_cook", False),
                servings=meal_data.get("servings", preferences.household_size),
                recipe_data=meal_data.get("recipe", {}),
            )
            db.add(item)

    db.commit()
    db.refresh(meal_plan)

    return MealPlanResponse(
        id=str(meal_plan.id),
        week_start=meal_plan.week_start.isoformat(),
        items=[
            MealPlanItemResponse(
                id=str(item.id),
                day_of_week=item.day_of_week,
                meal_type=item.meal_type,
                meal_category=item.meal_category,
                is_bulk_cook=item.is_bulk_cook,
                servings=item.servings,
                recipe_data=item.recipe_data or {},
            )
            for item in meal_plan.items
        ],
        created_at=meal_plan.created_at.isoformat(),
    )


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

    return MealPlanResponse(
        id=str(plan.id),
        week_start=plan.week_start.isoformat(),
        items=[
            MealPlanItemResponse(
                id=str(item.id),
                day_of_week=item.day_of_week,
                meal_type=item.meal_type,
                meal_category=item.meal_category,
                is_bulk_cook=item.is_bulk_cook,
                servings=item.servings,
                recipe_data=item.recipe_data or {},
            )
            for item in plan.items
        ],
        created_at=plan.created_at.isoformat(),
    )


@router.get("/history", response_model=List[MealPlanResponse])
async def get_plan_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plans = db.query(MealPlan).filter(
        MealPlan.user_id == current_user.id
    ).order_by(MealPlan.created_at.desc()).limit(10).all()

    return [
        MealPlanResponse(
            id=str(p.id),
            week_start=p.week_start.isoformat(),
            items=[
                MealPlanItemResponse(
                    id=str(i.id),
                    day_of_week=i.day_of_week,
                    meal_type=i.meal_type,
                    meal_category=i.meal_category,
                    is_bulk_cook=i.is_bulk_cook,
                    servings=i.servings,
                    recipe_data=i.recipe_data or {},
                )
                for i in p.items
            ],
            created_at=p.created_at.isoformat(),
        )
        for p in plans
    ]
