from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.meal_plan import MealPlan
from app.models.grocery import GroceryList
from app.schemas.grocery import GroceryListResponse, GroceryListGenerate, GroceryItem
from typing import List

router = APIRouter()


def extract_grocery_items(meal_plan: MealPlan) -> List[dict]:
    ingredient_map = {}
    for item in meal_plan.items:
        recipe = item.recipe_data or {}
        for ingredient in recipe.get("ingredients", []):
            name = ingredient.get("name", "").lower().strip()
            if name in ingredient_map:
                pass  # Merge quantities in a real implementation
            else:
                category = ingredient.get("category", "pantry")
                ingredient_map[name] = {
                    "name": name.title(),
                    "quantity": ingredient.get("quantity", "1"),
                    "unit": ingredient.get("unit", ""),
                    "category": category,
                    "checked": False,
                    "estimated_price": ingredient.get("price", None),
                }
    return list(ingredient_map.values())


@router.post("/generate", response_model=GroceryListResponse)
async def generate_grocery_list(
    request: GroceryListGenerate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    meal_plan = db.query(MealPlan).filter(
        MealPlan.id == request.meal_plan_id,
        MealPlan.user_id == current_user.id,
    ).first()
    if not meal_plan:
        raise HTTPException(status_code=404, detail="Meal plan not found")

    items = extract_grocery_items(meal_plan)
    total = sum(i.get("estimated_price", 0) or 0 for i in items)

    grocery_list = GroceryList(
        user_id=current_user.id,
        meal_plan_id=meal_plan.id,
        items=items,
        price_estimates={"estimated_total": total},
        total_estimated_cost=total,
    )
    db.add(grocery_list)
    db.commit()
    db.refresh(grocery_list)

    return GroceryListResponse(
        id=str(grocery_list.id),
        meal_plan_id=str(grocery_list.meal_plan_id),
        items=[GroceryItem(**i) for i in items],
        price_estimates=grocery_list.price_estimates,
        total_estimated_cost=grocery_list.total_estimated_cost,
        created_at=grocery_list.created_at.isoformat(),
    )


@router.get("/current", response_model=GroceryListResponse)
async def get_current_grocery_list(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    grocery_list = db.query(GroceryList).filter(
        GroceryList.user_id == current_user.id
    ).order_by(GroceryList.created_at.desc()).first()

    if not grocery_list:
        raise HTTPException(status_code=404, detail="No grocery list found")

    return GroceryListResponse(
        id=str(grocery_list.id),
        meal_plan_id=str(grocery_list.meal_plan_id) if grocery_list.meal_plan_id else None,
        items=[GroceryItem(**i) for i in (grocery_list.items or [])],
        price_estimates=grocery_list.price_estimates or {},
        total_estimated_cost=grocery_list.total_estimated_cost or 0,
        created_at=grocery_list.created_at.isoformat(),
    )
