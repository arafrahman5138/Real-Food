#!/usr/bin/env python3
"""
Backfill existing recipes with correct recipe_role, is_component, and is_mes_scoreable.

Before this, all 25 original recipes were classified as 'full_meal'.
This script uses classify_meal_context() to detect the correct role
and also attempts MES-rescue pairing for full_meal recipes that fail the gate.

Usage:
  cd backend
  PYTHONPATH=. python3 scripts/backfill_recipe_roles.py          # dry-run
  PYTHONPATH=. python3 scripts/backfill_recipe_roles.py --apply   # commit changes
"""

from __future__ import annotations

import argparse

from app.db import SessionLocal, init_db

# Import ALL models so SQLAlchemy resolves relationships
from app.models import user, meal_plan, recipe as recipe_mod, grocery, gamification  # noqa: F401
from app.models import saved_recipe, nutrition, local_food  # noqa: F401
from app.models import metabolic, metabolic_profile  # noqa: F401

from app.models.recipe import Recipe, RECIPE_ROLES
from app.services.metabolic_engine import classify_meal_context

# ── Re-use importer helpers ──────────────────────────────────────────
from import_wholefood_site_recipes import (
    classify_recipe_role,
    passes_import_gate,
    attempt_mes_rescue,
    MIN_IMPORT_MES,
)


def backfill(apply: bool = False) -> None:
    init_db()
    db = SessionLocal()

    # Only backfill recipes that are NOT already correctly classified
    # (i.e., skip side-library entries that were seeded with correct roles)
    recipes = db.query(Recipe).all()

    updated = 0
    rescued = 0
    skipped = 0

    for r in recipes:
        # Skip side-library entries (already correctly classified)
        if r.recipe_role != "full_meal" and r.recipe_role in RECIPE_ROLES:
            skipped += 1
            continue

        # Also skip records from the shawarma group that already have component tags
        tags = r.tags or []
        if any(t in ("protein_base", "carb_base", "veg_side", "sauce") for t in tags):
            # These were manually tagged — classify from tags
            tag_role_map = {
                "protein_base": "protein_base",
                "carb_base": "carb_base",
                "veg_side": "veg_side",
                "sauce": "sauce",
            }
            for t in tags:
                if t in tag_role_map:
                    new_role = tag_role_map[t]
                    is_comp = new_role in ("protein_base", "carb_base", "veg_side", "sauce")
                    is_scoreable = new_role not in ("dessert", "sauce", "veg_side")
                    print(f"  TAG-CLASSIFY: '{r.title}' → role={new_role}, comp={is_comp}, scoreable={is_scoreable}")
                    if apply:
                        r.recipe_role = new_role
                        r.is_component = is_comp
                        r.is_mes_scoreable = is_scoreable
                    updated += 1
                    break
            continue

        # Detect meal_type from existing tags
        meal_type = None
        for t in tags:
            if t in ("breakfast", "lunch", "dinner", "snack", "dessert", "condiment"):
                meal_type = t
                break

        nutrition = r.nutrition_info or {}
        role, is_component, is_mes_scoreable = classify_recipe_role(
            r.title, meal_type, nutrition
        )

        # Check if role actually changed
        changed = (
            role != r.recipe_role
            or is_component != r.is_component
            or is_mes_scoreable != r.is_mes_scoreable
        )

        # For full_meal that pass MES — try to assign default pairings anyway
        pairing_ids = list(r.default_pairing_ids or [])
        if role == "full_meal" and is_mes_scoreable and not pairing_ids:
            passes, mes = passes_import_gate(nutrition)
            if not passes:
                # MES rescue
                ok, rescue_mes, top_ids = attempt_mes_rescue(nutrition, db, cuisine=r.cuisine or "global")
                if ok:
                    pairing_ids = top_ids
                    rescued += 1
                    print(f"  RESCUED: '{r.title}' MES {mes:.1f} → {rescue_mes:.1f} with {len(top_ids)} pairings")
                else:
                    print(f"  WARN: '{r.title}' MES {mes:.1f} — rescue failed (best: {rescue_mes:.1f})")
            else:
                # Still assign top pairings as suggestions even for passing meals
                _, _, top_ids = attempt_mes_rescue(nutrition, db, cuisine=r.cuisine or "global")
                pairing_ids = top_ids

        if changed or pairing_ids != list(r.default_pairing_ids or []):
            old_role = r.recipe_role
            print(f"  UPDATE: '{r.title}' → role={role} (was {old_role}), comp={is_component}, scoreable={is_mes_scoreable}, pairings={len(pairing_ids)}")
            if apply:
                r.recipe_role = role
                r.is_component = is_component
                r.is_mes_scoreable = is_mes_scoreable
                r.default_pairing_ids = pairing_ids
            updated += 1
        else:
            skipped += 1

    if apply:
        db.commit()
        print(f"\n✓ Committed: {updated} updated, {rescued} rescued, {skipped} skipped")
    else:
        print(f"\n[DRY RUN] Would update: {updated}, rescued: {rescued}, skipped: {skipped}")
        print("  Run with --apply to commit changes.")

    db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill recipe roles")
    parser.add_argument("--apply", action="store_true", help="Commit changes to database")
    args = parser.parse_args()
    backfill(apply=args.apply)
