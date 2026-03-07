"""
Deterministic weekly meal-plan generator built from Recipe rows.
"""
from __future__ import annotations

import random
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.recipe import Recipe
from app.services.metabolic_engine import compute_meal_mes, get_or_create_budget


DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MEAL_SLOTS = ["breakfast", "lunch", "dinner"]
TARGET_DISPLAY_MES = 70.0
BREAKFAST_MAX_CARBS = 15.0
BREAKFAST_MAX_CALORIES = 450.0
VARIETY_LIMITS = {
    "prep_heavy": {"breakfast": 2, "lunch": 2, "dinner": 2},
    "balanced": {"breakfast": 3, "lunch": 3, "dinner": 3},
    "variety_heavy": {"breakfast": 4, "lunch": 4, "dinner": 4},
}
PAIRING_ROLE_PRIORITY = ["veg_side", "carb_base", "sauce", "dessert", "protein_base", "full_meal"]


def _recipe_nutrition(recipe: Recipe) -> dict[str, float]:
    nutrition = recipe.nutrition_info or {}
    return {
        "calories": float(nutrition.get("calories", 0) or 0),
        "protein": float(nutrition.get("protein", 0) or nutrition.get("protein_g", 0) or 0),
        "carbs": float(nutrition.get("carbs", 0) or nutrition.get("carbs_g", 0) or nutrition.get("sugar", 0) or nutrition.get("sugar_g", 0) or 0),
        "fat": float(nutrition.get("fat", 0) or nutrition.get("fat_g", 0) or 0),
        "fiber": float(nutrition.get("fiber", 0) or nutrition.get("fiber_g", 0) or 0),
        "sugar": float(nutrition.get("sugar", 0) or nutrition.get("sugar_g", 0) or 0),
    }


def _combine_nutrition(*items: dict[str, float]) -> dict[str, float]:
    combined = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "fiber": 0.0, "sugar": 0.0}
    for item in items:
        for key in combined:
            combined[key] += float(item.get(key, 0) or 0)
    return combined


def _pick_default_pairing(recipe: Recipe, recipe_index: dict[str, Recipe]) -> Recipe | None:
    default_ids = getattr(recipe, "default_pairing_ids", None) or []
    if getattr(recipe, "needs_default_pairing", None) is not True or not default_ids:
        return None

    pairing_candidates = [recipe_index.get(str(recipe_id)) for recipe_id in default_ids]
    pairing_candidates = [candidate for candidate in pairing_candidates if candidate is not None]
    if not pairing_candidates:
        return None

    return sorted(
        pairing_candidates,
        key=lambda item: (
            PAIRING_ROLE_PRIORITY.index((getattr(item, "recipe_role", None) or "full_meal"))
            if (getattr(item, "recipe_role", None) or "full_meal") in PAIRING_ROLE_PRIORITY
            else len(PAIRING_ROLE_PRIORITY)
        ),
    )[0]


def _meal_display_mes(recipe: Recipe, budget: Any, recipe_index: dict[str, Recipe]) -> dict[str, Any]:
    nutrition = _recipe_nutrition(recipe)
    paired_recipe = _pick_default_pairing(recipe, recipe_index)
    if paired_recipe:
        nutrition = _combine_nutrition(nutrition, _recipe_nutrition(paired_recipe))

    mes = compute_meal_mes(nutrition, budget)
    display_score = float(mes.get("display_score", 0) or 0)
    return {
        **mes,
        "display_score": display_score,
        "display_tier": mes.get("display_tier", "critical"),
        "paired_recipe_id": str(paired_recipe.id) if paired_recipe else None,
        "paired_recipe_title": paired_recipe.title if paired_recipe else None,
    }


def _matches_dietary(recipe: Recipe, dietary: list[str]) -> bool:
    required = {item.lower() for item in dietary if item and item.lower() != "none"}
    if not required:
        return True
    recipe_tags = {item.lower() for item in (recipe.dietary_tags or [])}
    return required.issubset(recipe_tags)


def _is_breakfast_safe(recipe: Recipe) -> bool:
    if "breakfast" not in (recipe.tags or []):
        return False
    if (recipe.recipe_role or "full_meal") != "full_meal" or bool(recipe.is_component):
        return False
    if recipe.is_mes_scoreable is False:
        return False

    nutrition = _recipe_nutrition(recipe)
    if nutrition["carbs"] > BREAKFAST_MAX_CARBS or nutrition["calories"] > BREAKFAST_MAX_CALORIES:
        return False

    flavor_tags = {tag.lower() for tag in (recipe.flavor_profile or [])}
    if "sweet" in flavor_tags:
        return False
    return True


def _preference_alignment_score(
    recipe: Recipe,
    dietary: list[str],
    flavor_preferences: list[str],
    liked_ingredients: list[str],
    liked_proteins: list[str],
    preferred_recipe_ids: set[str],
) -> int:
    score = 0
    ingredient_names = " ".join(ing.get("name", "") for ing in (recipe.ingredients or [])).lower()
    dietary_tags = {tag.lower() for tag in (recipe.dietary_tags or [])}
    flavor_tags = {tag.lower() for tag in (recipe.flavor_profile or [])}

    if str(recipe.id) in preferred_recipe_ids:
        score += 6
    if dietary and dietary_tags.intersection({tag.lower() for tag in dietary if tag.lower() != "none"}):
        score += 2
    if flavor_preferences and flavor_tags.intersection({tag.lower() for tag in flavor_preferences}):
        score += 2
    if liked_ingredients and any(item.lower() in ingredient_names for item in liked_ingredients):
        score += 2
    if liked_proteins and any(item.lower() in ingredient_names for item in liked_proteins):
        score += 3

    return score


def _candidate_pool(
    all_recipes: list[Recipe],
    recipe_index: dict[str, Recipe],
    meal_type: str,
    dietary: list[str],
    allergies: list[str],
    disliked_ingredients: list[str],
    liked_ingredients: list[str],
    flavor_preferences: list[str],
    liked_proteins: list[str],
    disliked_proteins: list[str],
    preferred_recipe_ids: set[str],
    avoided_recipe_ids: set[str],
    budget: Any,
) -> list[dict[str, Any]]:
    allergy_lower = {a.lower() for a in allergies}
    disliked_ingredients_lower = {d.lower() for d in disliked_ingredients}
    disliked_proteins_lower = {p.lower() for p in disliked_proteins}

    ranked: list[dict[str, Any]] = []
    for recipe in all_recipes:
        if meal_type not in (recipe.tags or []):
            continue
        if (recipe.recipe_role or "full_meal") != "full_meal" or bool(recipe.is_component):
            continue
        if recipe.is_mes_scoreable is False:
            continue
        if not _matches_dietary(recipe, dietary):
            continue
        if str(recipe.id) in avoided_recipe_ids:
            continue
        if meal_type == "breakfast" and not _is_breakfast_safe(recipe):
            continue

        ingredient_names = " ".join(ing.get("name", "") for ing in (recipe.ingredients or [])).lower()
        if any(a in ingredient_names for a in allergy_lower):
            continue
        if any(d in ingredient_names for d in disliked_ingredients_lower):
            continue
        if any(d in ingredient_names for d in disliked_proteins_lower):
            continue

        mes = _meal_display_mes(recipe, budget, recipe_index)
        preference_score = _preference_alignment_score(
            recipe=recipe,
            dietary=dietary,
            flavor_preferences=flavor_preferences,
            liked_ingredients=liked_ingredients,
            liked_proteins=liked_proteins,
            preferred_recipe_ids=preferred_recipe_ids,
        )
        display_score = float(mes.get("display_score", 0) or 0)
        ranked.append(
            {
                "recipe": recipe,
                "mes": mes,
                "display_score": display_score,
                "display_tier": mes.get("display_tier", "critical"),
                "meets_target": display_score >= TARGET_DISPLAY_MES,
                "preferred": str(recipe.id) in preferred_recipe_ids,
                "preference_score": preference_score,
                "random_tiebreak": random.random(),
            }
        )

    ranked.sort(
        key=lambda item: (
            1 if item["preferred"] else 0,
            1 if item["meets_target"] else 0,
            item["display_score"],
            item["preference_score"],
            item["random_tiebreak"],
        ),
        reverse=True,
    )
    return ranked


def _top_unique_candidates(
    candidates: list[dict[str, Any]],
    limit: int,
    exclude_recipe_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    exclude = exclude_recipe_ids or set()
    picked: list[dict[str, Any]] = []
    seen: set[str] = set()
    for candidate in candidates:
        recipe_id = str(candidate["recipe"].id)
        if recipe_id in exclude or recipe_id in seen:
            continue
        picked.append(candidate)
        seen.add(recipe_id)
        if len(picked) >= limit:
            break
    return picked


def _block_lengths(unique_count: int) -> list[int]:
    if unique_count <= 1:
        return [7]
    if unique_count == 2:
        return [3, 4]
    if unique_count == 3:
        return [2, 2, 3]
    return [2, 2, 2, 1]


def _prep_day_for_block(start_index: int) -> str:
    if start_index <= 2:
        return "Sunday"
    if start_index <= 5:
        return "Wednesday"
    return "Saturday"


def _meal_category_for_block(day: str, meal_type: str, repeated: bool) -> tuple[str, bool]:
    if meal_type == "breakfast":
        return "quick", False
    if repeated:
        return "bulk_cook", True
    if meal_type == "dinner" and day in ("Saturday", "Sunday"):
        return "sit_down", False
    return "quick", False


def _prep_summary_text(prep_day: str, recipe_title: str, covers_days: list[str], meal_type: str) -> str:
    meal_label = {
        "breakfast": "breakfasts",
        "lunch": "lunches",
        "dinner": "dinners",
    }.get(meal_type, meal_type)
    day_range = covers_days[0] if len(covers_days) == 1 else f"{covers_days[0]}-{covers_days[-1]}"
    return f"Prep {prep_day}: {recipe_title} for {day_range} {meal_label}"


def _shortlist_recipe(recipe: Recipe, mes: dict[str, Any], meal_type: str) -> dict[str, Any]:
    return {
        "id": str(recipe.id),
        "title": recipe.title,
        "description": recipe.description or "",
        "meal_type": meal_type,
        "total_time_min": (recipe.total_time_min or 0) or ((recipe.prep_time_min or 0) + (recipe.cook_time_min or 0)),
        "difficulty": recipe.difficulty or "easy",
        "mes_display_score": float(mes.get("display_score", 0) or 0),
        "mes_display_tier": mes.get("display_tier", "critical"),
        "meets_mes_target": float(mes.get("display_score", 0) or 0) >= TARGET_DISPLAY_MES,
    }


def _recipe_to_meal_data(
    recipe: Recipe,
    meal_type: str,
    category: str,
    servings: int,
    mes: dict[str, Any],
    prep_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    display_score = float(mes.get("display_score", 0) or 0)
    prep_meta = prep_meta or {}
    prep_group_id = prep_meta.get("prep_group_id")
    repeat_index = int(prep_meta.get("repeat_index", 0) or 0)
    return {
        "meal_type": meal_type,
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
            "nutrition_estimate": _recipe_nutrition(recipe),
            "mes_display_score": display_score,
            "mes_display_tier": mes.get("display_tier", "critical"),
            "meets_mes_target": display_score >= TARGET_DISPLAY_MES,
            "prep_group_id": prep_group_id,
            "prep_day": prep_meta.get("prep_day"),
            "prep_label": prep_meta.get("prep_label"),
            "prep_window_start_day": prep_meta.get("prep_window_start_day"),
            "prep_window_end_day": prep_meta.get("prep_window_end_day"),
            "is_prep_day": bool(prep_meta.get("is_prep_day", False)),
            "is_reheat": bool(prep_meta.get("is_reheat", False)),
            "repeat_index": repeat_index,
            "prep_status": prep_meta.get("prep_status"),
        },
    }


def _day_average_display_mes(meals: list[dict[str, Any]]) -> float:
    if not meals:
        return 0.0
    total = sum(float(meal.get("recipe", {}).get("mes_display_score", 0) or 0) for meal in meals)
    return round(total / len(meals), 1)


def _quality_summary(days: list[dict[str, Any]]) -> dict[str, Any]:
    daily_averages = [_day_average_display_mes(day.get("meals", [])) for day in days]
    all_meals = [meal for day in days for meal in day.get("meals", [])]
    qualifying_meals = [meal for meal in all_meals if meal.get("recipe", {}).get("meets_mes_target")]
    days_meeting_target = sum(1 for avg in daily_averages if avg >= TARGET_DISPLAY_MES)
    weekly_average = round(sum(daily_averages) / len(daily_averages), 1) if daily_averages else 0.0

    return {
        "target_meal_display_mes": TARGET_DISPLAY_MES,
        "target_daily_average_display_mes": TARGET_DISPLAY_MES,
        "actual_weekly_average_daily_display_mes": weekly_average,
        "qualifying_meal_count": len(qualifying_meals),
        "total_meal_count": len(all_meals),
        "days_meeting_target": days_meeting_target,
        "total_days": len(days),
    }


def _preferences_context(preferences: dict[str, Any], db: Session, user_id: str | None) -> dict[str, Any]:
    protein_preferences = preferences.get("protein_preferences", {}) or {}
    return {
        "dietary": preferences.get("dietary_restrictions", []) or [],
        "allergies": preferences.get("allergies", []) or [],
        "disliked_ingredients": preferences.get("disliked_ingredients", []) or [],
        "liked_ingredients": preferences.get("liked_ingredients", []) or [],
        "flavor_preferences": preferences.get("flavor_preferences", []) or [],
        "liked_proteins": protein_preferences.get("liked", []) if isinstance(protein_preferences, dict) else [],
        "disliked_proteins": protein_preferences.get("disliked", []) if isinstance(protein_preferences, dict) else [],
        "preferred_recipe_ids": {str(item) for item in (preferences.get("preferred_recipe_ids", []) or [])},
        "avoided_recipe_ids": {str(item) for item in (preferences.get("avoided_recipe_ids", []) or [])},
        "household": int(preferences.get("household_size", 1) or 1),
        "variety_mode": preferences.get("variety_mode", "balanced") or "balanced",
        "budget": get_or_create_budget(db, user_id) if user_id else None,
    }


def get_shortlist_candidates(db: Session, preferences: dict, user_id: str | None = None, per_slot: int = 4) -> dict[str, Any]:
    context = _preferences_context(preferences, db, user_id)
    all_recipes = db.query(Recipe).all()
    recipe_index = {str(recipe.id): recipe for recipe in all_recipes}
    sections: list[dict[str, Any]] = []

    for slot in MEAL_SLOTS:
        candidates = _candidate_pool(
            all_recipes=all_recipes,
            recipe_index=recipe_index,
            meal_type=slot,
            dietary=context["dietary"],
            allergies=context["allergies"],
            disliked_ingredients=context["disliked_ingredients"],
            liked_ingredients=context["liked_ingredients"],
            flavor_preferences=context["flavor_preferences"],
            liked_proteins=context["liked_proteins"],
            disliked_proteins=context["disliked_proteins"],
            preferred_recipe_ids=context["preferred_recipe_ids"],
            avoided_recipe_ids=context["avoided_recipe_ids"],
            budget=context["budget"],
        )
        items = [
            _shortlist_recipe(candidate["recipe"], candidate["mes"], slot)
            for candidate in _top_unique_candidates(candidates, per_slot)
        ]
        sections.append({"meal_type": slot, "items": items})

    return {"sections": sections}


def get_replacement_candidates(
    db: Session,
    preferences: dict,
    meal_type: str,
    user_id: str | None = None,
    exclude_recipe_ids: set[str] | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    context = _preferences_context(preferences, db, user_id)
    all_recipes = db.query(Recipe).all()
    recipe_index = {str(recipe.id): recipe for recipe in all_recipes}
    candidates = _candidate_pool(
        all_recipes=all_recipes,
        recipe_index=recipe_index,
        meal_type=meal_type,
        dietary=context["dietary"],
        allergies=context["allergies"],
        disliked_ingredients=context["disliked_ingredients"],
        liked_ingredients=context["liked_ingredients"],
        flavor_preferences=context["flavor_preferences"],
        liked_proteins=context["liked_proteins"],
        disliked_proteins=context["disliked_proteins"],
        preferred_recipe_ids=context["preferred_recipe_ids"],
        avoided_recipe_ids=context["avoided_recipe_ids"],
        budget=context["budget"],
    )
    return _top_unique_candidates(candidates, limit, exclude_recipe_ids=exclude_recipe_ids)


def generate_fallback_meal_plan(db: Session, preferences: dict, user_id: str | None = None) -> dict[str, Any]:
    """Build a 7-day plan from DB recipes without LLMs or substitutions."""
    context = _preferences_context(preferences, db, user_id)
    all_recipes = db.query(Recipe).all()
    recipe_index = {str(recipe.id): recipe for recipe in all_recipes}

    slot_pools: dict[str, list[dict[str, Any]]] = {}
    for slot in MEAL_SLOTS:
        slot_pools[slot] = _candidate_pool(
            all_recipes=all_recipes,
            recipe_index=recipe_index,
            meal_type=slot,
            dietary=context["dietary"],
            allergies=context["allergies"],
            disliked_ingredients=context["disliked_ingredients"],
            liked_ingredients=context["liked_ingredients"],
            flavor_preferences=context["flavor_preferences"],
            liked_proteins=context["liked_proteins"],
            disliked_proteins=context["disliked_proteins"],
            preferred_recipe_ids=context["preferred_recipe_ids"],
            avoided_recipe_ids=context["avoided_recipe_ids"],
            budget=context["budget"],
        )

    days_map: dict[str, list[dict[str, Any]]] = {day: [] for day in DAYS}
    prep_timeline: list[dict[str, Any]] = []
    warnings: list[str] = []

    for slot in MEAL_SLOTS:
        unique_limit = VARIETY_LIMITS.get(context["variety_mode"], VARIETY_LIMITS["balanced"]).get(slot, 3)
        selected_candidates = _top_unique_candidates(slot_pools[slot], unique_limit)
        if not selected_candidates:
            warnings.append(f"No {slot} recipes could be selected for this plan.")
            continue

        block_lengths = _block_lengths(len(selected_candidates))
        day_index = 0
        for candidate, block_length in zip(selected_candidates, block_lengths):
            recipe = candidate["recipe"]
            mes = candidate["mes"]
            covers_days = DAYS[day_index:day_index + block_length]
            repeated = slot != "breakfast" and block_length > 1 and context["variety_mode"] in {"prep_heavy", "balanced"}

            prep_meta_base: dict[str, Any] = {}
            if repeated and covers_days:
                prep_group_id = str(uuid.uuid4())
                prep_day = _prep_day_for_block(day_index)
                prep_meta_base = {
                    "prep_group_id": prep_group_id,
                    "prep_day": prep_day,
                    "prep_label": f"Prep {prep_day}",
                    "prep_window_start_day": covers_days[0],
                    "prep_window_end_day": covers_days[-1],
                }
                prep_timeline.append(
                    {
                        "prep_group_id": prep_group_id,
                        "recipe_id": str(recipe.id),
                        "recipe_title": recipe.title,
                        "meal_type": slot,
                        "prep_day": prep_day,
                        "covers_days": covers_days,
                        "servings_to_make": context["household"] * len(covers_days),
                        "summary_text": _prep_summary_text(prep_day, recipe.title, covers_days, slot),
                    }
                )

            for offset, day in enumerate(covers_days):
                category, is_bulk = _meal_category_for_block(day, slot, repeated)
                prep_meta = {
                    **prep_meta_base,
                    "is_prep_day": False,
                    "is_reheat": repeated and offset > 0,
                    "repeat_index": offset,
                    "prep_status": "reheat" if repeated and offset > 0 else ("prepped" if repeated else None),
                }
                meal_data = _recipe_to_meal_data(
                    recipe=recipe,
                    meal_type=slot,
                    category=category,
                    servings=context["household"],
                    mes=mes,
                    prep_meta=prep_meta,
                )
                meal_data["is_bulk_cook"] = is_bulk
                days_map[day].append(meal_data)

            day_index += block_length

    days_list: list[dict[str, Any]] = []
    for day in DAYS:
        meals = sorted(days_map.get(day, []), key=lambda meal: MEAL_SLOTS.index(meal["meal_type"]))
        days_list.append({"day": day, "meals": meals})

    quality_summary = _quality_summary(days_list)
    if quality_summary["qualifying_meal_count"] < quality_summary["total_meal_count"]:
        warnings.append("Some meal slots could not reach the 70+ MES target with the current recipe library.")
    if quality_summary["days_meeting_target"] < quality_summary["total_days"]:
        warnings.append("Some days fell below the 70+ average MES target; best available meals were used.")

    deduped_warnings = list(dict.fromkeys(warnings))
    return {
        "days": days_list,
        "quality_summary": quality_summary,
        "warnings": deduped_warnings,
        "prep_timeline": prep_timeline,
    }
