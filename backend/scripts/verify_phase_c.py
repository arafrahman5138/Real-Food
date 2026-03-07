"""Verify Phase C state."""
from app.db import SessionLocal, init_db
# Import all models for relationship resolution
from app.models import user, meal_plan, recipe as recipe_mod, grocery, gamification  # noqa: F401
from app.models import saved_recipe, nutrition, local_food  # noqa: F401
from app.models import metabolic, metabolic_profile  # noqa: F401
from app.models.recipe import Recipe
from collections import Counter

init_db()
db = SessionLocal()
recipes = db.query(Recipe).all()

roles = Counter(r.recipe_role for r in recipes)
print("=== Recipe Role Distribution ===")
for role, count in sorted(roles.items()):
    print(f"  {role}: {count}")
print(f"  Total: {len(recipes)}")
print()

scoreable = [r for r in recipes if r.is_mes_scoreable]
non_scoreable = [r for r in recipes if not r.is_mes_scoreable]
print(f"Scoreable: {len(scoreable)}, Non-scoreable: {len(non_scoreable)}")
print()

rescued = [r for r in recipes if r.recipe_role == "full_meal" and r.default_pairing_ids]
print(f"=== Full meals with default pairings: {len(rescued)} ===")
for r in rescued:
    print(f"  {r.title} -> {len(r.default_pairing_ids)} pairings")
print()

comps = [r for r in recipes if r.is_component]
print(f"=== Components: {len(comps)} ===")
for r in comps:
    print(f"  {r.title} ({r.recipe_role})")
print()

desserts = [r for r in recipes if r.recipe_role == "dessert"]
print(f"=== Desserts: {len(desserts)} ===")
for r in desserts:
    print(f"  {r.title}")

db.close()
