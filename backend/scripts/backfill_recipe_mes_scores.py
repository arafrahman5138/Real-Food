#!/usr/bin/env python3
"""
Backfill recipe MES fields in-place using the current refactored MES engine.

Rules applied:
- Only score true meals (full_meal + scoreable + not component + not dessert/sauce context).
- Desserts and meal-prep components do not keep recipe-level MES fields.
- If a scoreable meal has needs_default_pairing=True, compute and store a composite
  MES with its preferred default side.

Usage:
  cd backend
  PYTHONPATH=. python3 scripts/backfill_recipe_mes_scores.py           # dry run
  PYTHONPATH=. python3 scripts/backfill_recipe_mes_scores.py --apply   # commit
"""

from __future__ import annotations

import argparse
import json
from typing import Any

from app.db import SessionLocal, init_db

# Import all model modules so SQLAlchemy relationships resolve cleanly.
from app.models import user, meal_plan, grocery, gamification  # noqa: F401
from app.models import saved_recipe, nutrition, local_food  # noqa: F401
from app.models import metabolic, metabolic_profile  # noqa: F401

from app.models.recipe import Recipe
from app.services.metabolic_engine import (
    DEFAULT_COMPUTED_BUDGET,
    classify_meal_context,
    compute_meal_mes,
)

ROLE_PRIORITY = ["veg_side", "carb_base", "sauce", "dessert", "protein_base", "full_meal"]
MES_FIELDS_TO_CLEAR = (
    "mes_score",
    "mes_tier",
    "mes_display_score",
    "mes_display_tier",
    "mes_sub_scores",
    "mes_breakdown",
    "mes_gate_pass",
    "mes_score_with_default_pairing",
    "mes_default_pairing_delta",
    "mes_default_pairing_id",
    "mes_default_pairing_title",
    "mes_default_pairing_role",
)


def _extract_meal_type(tags: list[Any]) -> str | None:
    for tag in tags or []:
        t = str(tag or "").strip().lower()
        if t in {"breakfast", "lunch", "dinner", "snack", "dessert", "condiment"}:
            return t
    return None


def _is_scoreable_recipe(recipe: Recipe, nutrition: dict[str, Any]) -> bool:
    role = (getattr(recipe, "recipe_role", None) or "full_meal").strip().lower()
    if role != "full_meal":
        return False
    if bool(getattr(recipe, "is_component", False)):
        return False
    if getattr(recipe, "is_mes_scoreable", True) is False:
        return False

    meal_type = _extract_meal_type(getattr(recipe, "tags", None) or [])
    ctx = classify_meal_context(recipe.title, meal_type, nutrition)
    return ctx == "full_meal"


def _preferred_default_pairing(db, recipe: Recipe) -> Recipe | None:
    default_ids = [str(v) for v in (recipe.default_pairing_ids or []) if v]
    if not default_ids:
        return None
    candidates = db.query(Recipe).filter(Recipe.id.in_(default_ids)).all()
    if not candidates:
        return None

    return sorted(
        candidates,
        key=lambda r: (
            ROLE_PRIORITY.index((getattr(r, "recipe_role", None) or "full_meal"))
            if (getattr(r, "recipe_role", None) or "full_meal") in ROLE_PRIORITY
            else len(ROLE_PRIORITY),
            str(getattr(r, "id", "")),
        ),
    )[0]


def _combined_nutrition(a: dict[str, Any], b: dict[str, Any]) -> dict[str, float]:
    combined: dict[str, float] = {}
    for key in (
        "protein",
        "protein_g",
        "fiber",
        "fiber_g",
        "carbs",
        "carbs_g",
        "sugar",
        "sugar_g",
        "calories",
        "fat",
        "fat_g",
    ):
        combined[key] = float(a.get(key, 0) or 0) + float(b.get(key, 0) or 0)
    return combined


def _clear_mes_fields(nutrition_info: dict[str, Any]) -> dict[str, Any]:
    cleaned = dict(nutrition_info or {})
    for field in MES_FIELDS_TO_CLEAR:
        cleaned.pop(field, None)
    return cleaned


def backfill(apply: bool = False) -> None:
    init_db()
    db = SessionLocal()
    try:
        recipes = db.query(Recipe).all()

        updated = 0
        unchanged = 0
        scoreable_count = 0
        unscoreable_count = 0
        paired_count = 0
        pairing_missing_count = 0

        for recipe in recipes:
            original_nutrition = dict(recipe.nutrition_info or {})
            new_nutrition = _clear_mes_fields(original_nutrition)
            original_is_mes_scoreable = (
                True if recipe.is_mes_scoreable is None else bool(recipe.is_mes_scoreable)
            )

            scoreable = _is_scoreable_recipe(recipe, original_nutrition)
            desired_is_mes_scoreable = bool(scoreable)
            if scoreable:
                scoreable_count += 1
                mes = compute_meal_mes(original_nutrition, DEFAULT_COMPUTED_BUDGET)
                new_nutrition["mes_score"] = round(float(mes.get("total_score", 0) or 0), 1)
                new_nutrition["mes_display_score"] = round(float(mes.get("display_score", 0) or 0), 1)
                new_nutrition["mes_tier"] = mes.get("tier", "critical")
                new_nutrition["mes_display_tier"] = mes.get("display_tier", "critical")
                new_nutrition["mes_sub_scores"] = mes.get("sub_scores", {})

                if recipe.needs_default_pairing is True:
                    default_pair = _preferred_default_pairing(db, recipe)
                    if default_pair is not None:
                        paired_count += 1
                        combined = _combined_nutrition(
                            original_nutrition,
                            default_pair.nutrition_info or {},
                        )
                        combined_mes = compute_meal_mes(combined, DEFAULT_COMPUTED_BUDGET)
                        combined_score = round(float(combined_mes.get("display_score", 0) or 0), 1)
                        base_score = round(float(mes.get("display_score", 0) or 0), 1)
                        new_nutrition["mes_score_with_default_pairing"] = combined_score
                        new_nutrition["mes_default_pairing_delta"] = round(combined_score - base_score, 1)
                        new_nutrition["mes_default_pairing_id"] = str(default_pair.id)
                        new_nutrition["mes_default_pairing_title"] = default_pair.title
                        new_nutrition["mes_default_pairing_role"] = (
                            getattr(default_pair, "recipe_role", None) or "full_meal"
                        )
                    else:
                        pairing_missing_count += 1
            else:
                unscoreable_count += 1

            before = json.dumps(original_nutrition, sort_keys=True, default=str)
            after = json.dumps(new_nutrition, sort_keys=True, default=str)
            scoreability_changed = original_is_mes_scoreable != desired_is_mes_scoreable

            if before != after or scoreability_changed:
                updated += 1
                if apply:
                    recipe.nutrition_info = new_nutrition
                    recipe.is_mes_scoreable = desired_is_mes_scoreable
                print(
                    f"UPDATE: {recipe.title} | scoreable={scoreable} "
                    f"| mes={new_nutrition.get('mes_display_score', '-')}"
                )
            else:
                unchanged += 1

        if apply:
            db.commit()
            print("\nCommitted recipe MES backfill.")
        else:
            print("\nDry run only. No DB changes committed.")

        print(
            f"Total={len(recipes)} | updated={updated} | unchanged={unchanged} "
            f"| scoreable={scoreable_count} | unscoreable={unscoreable_count} "
            f"| default-paired={paired_count} | pairing-missing={pairing_missing_count}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill recipe MES scores")
    parser.add_argument("--apply", action="store_true", help="Commit DB changes")
    args = parser.parse_args()
    backfill(apply=args.apply)
