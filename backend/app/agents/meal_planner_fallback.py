"""
Fallback meal plan generator that assembles a weekly plan from seeded Recipe
rows when the LLM is unavailable (quota exceeded, network error, etc.).
"""
import random
from typing import List
from sqlalchemy.orm import Session
from app.models.recipe import Recipe


DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MEAL_SLOTS = ["breakfast", "lunch", "dinner"]


def _pick_recipes(
    db: Session,
    meal_type: str,
    dietary: List[str],
    allergies: List[str],
    disliked_ingredients: List[str],
    liked_proteins: List[str],
    disliked_proteins: List[str],
    count: int,
    exclude_ids: set,
) -> List[Recipe]:
    """Return up to `count` recipes matching the meal_type tag, respecting dietary/allergy filters."""
    candidates = db.query(Recipe).all()
    candidates = [
        r for r in candidates
        if meal_type in (r.tags or [])
    ]

    allergy_lower = {a.lower() for a in allergies}
    disliked_ingredients_lower = {d.lower() for d in disliked_ingredients}
    liked_proteins_lower = {p.lower() for p in liked_proteins}
    disliked_proteins_lower = {p.lower() for p in disliked_proteins}

    filtered = []
    for r in candidates:
        if r.id in exclude_ids:
            continue
        ingredient_names = " ".join(
            ing.get("name", "") for ing in (r.ingredients or [])
        ).lower()
        if any(a in ingredient_names for a in allergy_lower):
            continue
        if any(d in ingredient_names for d in disliked_ingredients_lower):
            continue
        if any(d in ingredient_names for d in disliked_proteins_lower):
            continue

        score = 0
        if liked_proteins_lower and any(p in ingredient_names for p in liked_proteins_lower):
            score += 2
        if dietary and any(tag in (r.dietary_tags or []) for tag in dietary):
            score += 1

        filtered.append((score, r))

    random.shuffle(filtered)
    filtered.sort(key=lambda item: item[0], reverse=True)
    return [r for _, r in filtered[:count]]


def _recipe_to_meal_data(recipe: Recipe, category: str, servings: int) -> dict:
    return {
        "meal_type": (recipe.tags or [""])[0] if recipe.tags else "",
        "category": category,
        "is_bulk_cook": category == "bulk_cook",
        "servings": servings if category == "bulk_cook" else recipe.servings or 1,
        "recipe": {
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
        },
    }


def generate_fallback_meal_plan(db: Session, preferences: dict) -> dict:
    """Build a 7-day plan from DB recipes without calling the LLM."""
    dietary = preferences.get("dietary_restrictions", [])
    allergies = preferences.get("allergies", [])
    disliked_ingredients = preferences.get("disliked_ingredients", [])
    protein_preferences = preferences.get("protein_preferences", {})
    liked_proteins = protein_preferences.get("liked", []) if isinstance(protein_preferences, dict) else []
    disliked_proteins = protein_preferences.get("disliked", []) if isinstance(protein_preferences, dict) else []
    household = preferences.get("household_size", 1)
    time_budget = preferences.get("cooking_time_budget", {"quick": 4, "medium": 2, "long": 1})

    bulk_days = {"Sunday", "Monday", "Wednesday"}

    used_ids: set = set()
    days_list = []

    for day in DAYS:
        meals = []
        for slot in MEAL_SLOTS:
            is_bulk = day in bulk_days and slot == "dinner"
            category = "bulk_cook" if is_bulk else ("sit_down" if day in ("Saturday", "Sunday") and slot == "dinner" and not is_bulk else "quick")

            picks = _pick_recipes(
                db,
                slot,
                dietary,
                allergies,
                disliked_ingredients,
                liked_proteins,
                disliked_proteins,
                1,
                used_ids,
            )
            if not picks:
                picks = _pick_recipes(
                    db,
                    slot,
                    dietary,
                    allergies,
                    disliked_ingredients,
                    liked_proteins,
                    disliked_proteins,
                    1,
                    set(),
                )
            if not picks:
                continue

            r = picks[0]
            used_ids.add(r.id)
            meal_data = _recipe_to_meal_data(r, category, household)
            meal_data["meal_type"] = slot
            meals.append(meal_data)

        days_list.append({"day": day, "meals": meals})

    return {"days": days_list}
