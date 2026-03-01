"""
Restore recipes from seed_meals_backup.json into the database.
Run:  python restore_meals.py
"""
import json
import uuid
from app.db import SessionLocal, init_db
from app.models.recipe import Recipe

# Import all models so relationships resolve
from app.models import user, meal_plan, recipe, grocery, gamification, saved_recipe, nutrition, local_food  # noqa: F401


def restore():
    init_db()
    db = SessionLocal()

    with open("seed_meals_backup.json") as f:
        data = json.load(f)

    existing_ids = {r[0] for r in db.query(Recipe.id).all()}
    added = 0

    for entry in data:
        if entry["id"] in existing_ids:
            continue

        r = Recipe(
            id=entry["id"],
            title=entry["title"],
            description=entry.get("description"),
            ingredients=entry.get("ingredients", []),
            steps=entry.get("steps", []),
            prep_time_min=entry.get("prep_time_min", 0),
            cook_time_min=entry.get("cook_time_min", 0),
            total_time_min=entry.get("total_time_min", 0),
            servings=entry.get("servings", 1),
            nutrition_info=entry.get("nutrition_info", {}),
            difficulty=entry.get("difficulty", "easy"),
            tags=entry.get("tags", []),
            flavor_profile=entry.get("flavor_profile", []),
            dietary_tags=entry.get("dietary_tags", []),
            cuisine=entry.get("cuisine", "american"),
            health_benefits=entry.get("health_benefits", []),
            protein_type=entry.get("protein_type", []),
            carb_type=entry.get("carb_type", []),
            is_ai_generated=entry.get("is_ai_generated", True),
            image_url=entry.get("image_url"),
        )
        db.add(r)
        added += 1

    db.commit()
    total = db.query(Recipe).count()
    print(f"Restored {added} recipes ({len(data) - added} already existed). Total in DB: {total}")
    db.close()


if __name__ == "__main__":
    restore()
