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


def _infer_category(name: str) -> str:
    n = (name or "").lower()

    if any(k in n for k in ["chicken", "beef", "pork", "turkey", "salmon", "fish", "shrimp", "egg", "tofu", "lentil", "bean", "chickpea"]):
        return "protein"
    if any(k in n for k in ["milk", "yogurt", "cheese", "butter", "cream"]):
        return "dairy"
    if any(k in n for k in ["rice", "oat", "quinoa", "bread", "pasta", "flour"]):
        return "grains"
    if any(k in n for k in ["salt", "pepper", "paprika", "cumin", "oregano", "cinnamon", "garlic powder", "onion powder"]):
        return "spices"
    if any(k in n for k in ["oil", "vinegar", "sauce", "broth", "stock", "can", "canned"]):
        return "pantry"
    return "produce"


def _normalize_ingredient(ingredient) -> dict:
    if isinstance(ingredient, dict):
        name = str(ingredient.get("name", "")).strip()
        quantity = str(ingredient.get("quantity", "1")).strip() or "1"
        unit = str(ingredient.get("unit", "")).strip()
        category = str(ingredient.get("category", "")).strip() or _infer_category(name)
        return {
            "name": name,
            "quantity": quantity,
            "unit": unit,
            "category": category,
            "checked": False,
        }

    name = str(ingredient or "").strip()
    return {
        "name": name,
        "quantity": "1",
        "unit": "",
        "category": _infer_category(name),
        "checked": False,
    }


def extract_grocery_items(meal_plan: MealPlan) -> List[dict]:
    ingredient_map: dict[str, dict] = {}

    for item in meal_plan.items:
        recipe = item.recipe_data or {}
        raw_ingredients = recipe.get("ingredients", []) or []
        for raw_ingredient in raw_ingredients:
            normalized = _normalize_ingredient(raw_ingredient)
            name_key = normalized["name"].lower().strip()
            if not name_key:
                continue

            if name_key in ingredient_map:
                existing = ingredient_map[name_key]
                if existing.get("quantity") in {"", "1"}:
                    existing["quantity"] = str(int(existing.get("quantity", "1")) + 1)
                else:
                    existing["quantity"] = f"{existing['quantity']} + 1"
            else:
                ingredient_map[name_key] = {
                    "name": normalized["name"].title(),
                    "quantity": normalized["quantity"],
                    "unit": normalized["unit"],
                    "category": normalized["category"],
                    "checked": False,
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
    grocery_list = GroceryList(
        user_id=current_user.id,
        meal_plan_id=meal_plan.id,
        items=items,
        price_estimates={},
        total_estimated_cost=0,
    )
    db.add(grocery_list)
    db.commit()
    db.refresh(grocery_list)

    return GroceryListResponse(
        id=str(grocery_list.id),
        meal_plan_id=str(grocery_list.meal_plan_id),
        items=[GroceryItem(**i) for i in items],
        price_estimates={},
        total_estimated_cost=0,
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
        price_estimates={},
        total_estimated_cost=0,
        created_at=grocery_list.created_at.isoformat(),
    )
