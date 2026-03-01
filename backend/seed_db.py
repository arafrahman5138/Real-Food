"""
Seed the database with whole-food recipes.
Combines original 150 meals + global cuisine meals.
Auto-computes health benefits from ingredients.
Run:  python seed_db.py
"""
import uuid
from app.db import SessionLocal, init_db
from app.models.recipe import Recipe
from app.seed_meals import SEED_MEALS
from app.seed_meals_global import GLOBAL_MEALS
from app.nutrition_tags import compute_health_benefits

# ── protein / carb classification maps ─────────────────────────
PROTEIN_KEYWORDS: dict[str, list[str]] = {
    "chicken":    ["chicken", "cornish game hen"],
    "beef":       ["beef", "ribeye", "flank steak", "short ribs", "stew meat", "bison", "oxtail", "liver"],
    "lamb":       ["lamb", "goat"],
    "pork":       ["pork", "bacon", "pancetta", "prosciutto", "sausage", "duck"],
    "salmon":     ["salmon"],
    "shrimp":     ["shrimp", "scallop"],
    "other_fish": ["tuna", "cod", "tilapia", "sole", "sardine", "mackerel", "trout", "fish"],
    "eggs":       ["egg"],
    "vegetarian": ["chickpea", "lentil", "bean", "tofu", "edamame"],
}

CARB_KEYWORDS: dict[str, list[str]] = {
    "rice":            ["rice"],
    "sweet_potato":    ["sweet potato"],
    "potato":          ["potato", "russet"],
    "sourdough_bread": ["sourdough", "bread", "rye bread"],
    "oats":            ["oats", "steel-cut", "rolled oats"],
    "quinoa":          ["quinoa"],
    "tortillas":       ["tortilla", "pita"],
    "noodles":         ["noodle", "soba", "vermicelli", "glass noodle", "pasta"],
    "plantain":        ["plantain"],
}

# Carb terms that override the "rice" keyword inside noodle/wrapper names
_NOODLE_HINTS = {"noodle", "vermicelli", "paper", "wrapper"}


def _classify_proteins(ingredients: list[dict]) -> list[str]:
    """Return sorted, deduplicated protein_type tags for a recipe."""
    tags: set[str] = set()
    for ing in ingredients:
        if (ing.get("category") or "").lower() != "protein":
            continue
        name = (ing.get("name") or "").lower()
        for tag, keywords in PROTEIN_KEYWORDS.items():
            if any(kw in name for kw in keywords):
                tags.add(tag)
    return sorted(tags)


def _classify_carbs(ingredients: list[dict]) -> list[str]:
    """Return sorted, deduplicated carb_type tags for a recipe."""
    tags: set[str] = set()
    for ing in ingredients:
        cat = (ing.get("category") or "").lower()
        name = (ing.get("name") or "").lower()
        # Only consider grains + starchy produce
        if cat not in ("grains", "produce"):
            continue
        if cat == "produce":
            # Only match explicit starchy produce
            if "sweet potato" in name:
                tags.add("sweet_potato")
            elif "potato" in name or "russet" in name:
                tags.add("potato")
            elif "plantain" in name:
                tags.add("plantain")
            continue
        # cat == "grains"
        # Check noodle-like items first to avoid false "rice" match
        if any(h in name for h in _NOODLE_HINTS):
            tags.add("noodles")
            continue
        for tag, keywords in CARB_KEYWORDS.items():
            if any(kw in name for kw in keywords):
                tags.add(tag)
                break  # one tag per ingredient
    return sorted(tags)

CUISINE_DEFAULTS = {
    "american": [
        "Avocado Toast", "Greek Yogurt", "Banana Almond Butter", "Overnight Oats",
        "Scrambled Eggs", "Sweet Potato and Egg Hash", "Coconut Flour Pancakes",
        "Tropical Fruit Bowl", "Egg and Veggie Muffin Cups", "Egg Muffins",
        "Overnight Steel-Cut Oats", "Tuna Salad Lettuce Wraps",
        "Turkey and Avocado Collard Wrap", "Caprese Stuffed Avocado",
        "Grilled Chicken Caesar Salad", "Chicken and Vegetable Stir-Fry",
        "Grilled Salmon with Asparagus", "Grass-Fed Beef Burgers",
        "Garlic Butter Shrimp", "One-Pan Chicken Thighs",
        "Cauliflower Fried Rice", "Turkey Meatballs", "Stuffed Bell Peppers",
        "Chicken and Sweet Potato Meal Prep", "Beef and Vegetable Chili",
        "Chicken Bone Broth", "Turkey Bolognese", "Pulled Pork",
        "Baked Salmon Cakes", "Apple Slices", "Hard-Boiled Eggs",
        "Trail Mix", "Guacamole", "Energy Balls", "Celery with Sunflower",
        "Mixed Nuts", "Frozen Banana", "Edamame", "Stuffed Sweet Potatoes",
        "Zucchini Noodles with Pesto", "Egg Drop Soup", "Coconut Chia Pudding",
        "Roasted Brussels Sprouts", "Chicken Salad with Grapes",
        "Baked Chicken Drumsticks", "Veggie-Packed Frittata",
        "Taco Seasoned", "Banana Oat Muffins", "Bone Broth Ramen",
        "Stuffed Portobello", "Loaded Baked Potato", "Veggie Fritters",
        "Almond Crusted Chicken", "Crispy Baked Chicken Wings",
        "Sweet Potato Brownies", "Mixed Berry Crumble",
        "Beef and Broccoli Stir-Fry", "Breakfast Sausage Patties",
        "Turkey and Zucchini Meatloaf", "Baked Eggs in Avocado",
        "Coconut Chicken Strips", "Coconut Shrimp",
    ],
    "mediterranean": [
        "Mediterranean Quinoa", "Roasted Beet and Goat Cheese",
        "Smoked Salmon and Cream Cheese", "Baked Cod with Tomatoes",
        "Herb-Crusted Roast Chicken", "Eggplant Parmesan",
        "Grilled Steak with Chimichurri", "Spaghetti Squash Carbonara",
        "Baked Falafel", "Watermelon and Feta", "Sardines on Sourdough",
        "Pan-Fried Sole", "Mediterranean Stuffed Tomatoes",
        "Pesto Chicken", "Roasted Red Pepper Soup", "Cauliflower Steaks",
        "Minestrone Soup", "Roasted Vegetable and Quinoa Salad",
        "Grilled Vegetable Platter", "Grilled Peach and Arugula",
        "Balsamic Glazed Pork", "Pan-Seared Scallops",
    ],
    "indian": [
        "Coconut Lentil Dal", "Chicken Tikka Masala",
        "Coconut Curry with Vegetables", "Lentil Soup",
    ],
    "japanese": [
        "Miso Soup with Tofu", "Salmon Poke Bowl",
        "Teriyaki Salmon Bowls",
    ],
    "korean": [
        "Kimchi Fried Cauliflower Rice",
    ],
    "mexican": [
        "Black Bean and Sweet Potato Tacos", "Ceviche",
        "Black Bean and Quinoa Freezer Burritos",
    ],
    "thai": [
        "Thai Chicken Lettuce Cups", "Thai Green Curry with Chicken",
    ],
    "chinese": [
        "Asian Sesame Chicken Salad",
    ],
    "middle_eastern": [
        "Chicken Shawarma Bowl", "Hummus with Cucumber", "Roasted Beet Hummus",
        "Roasted Chickpeas", "Stuffed Dates", "Curried Egg Salad",
        "Lamb Kofta with Tzatziki",
    ],
    "moroccan": [
        "Lamb Tagine with Apricots", "Moroccan Chicken with Apricots",
        "Shakshuka",
    ],
    "vietnamese": [
        "Fresh Spring Rolls", "Cucumber Avocado Sushi Rolls",
    ],
    "peruvian": [
        "Ceviche",
    ],
}


def _guess_cuisine(title: str) -> str:
    """Match an existing meal title to a cuisine using substring lookup."""
    title_lower = title.lower()
    for cuisine, keywords in CUISINE_DEFAULTS.items():
        for kw in keywords:
            if kw.lower() in title_lower:
                return cuisine
    return "american"


def _build_recipe(meal: dict) -> Recipe:
    health = meal.get("health_benefits") or compute_health_benefits(meal.get("ingredients", []))
    cuisine = meal.get("cuisine") or _guess_cuisine(meal.get("title", ""))
    return Recipe(
        id=str(uuid.uuid4()),
        title=meal["title"],
        description=meal.get("description", ""),
        ingredients=meal.get("ingredients", []),
        steps=meal.get("steps", []),
        prep_time_min=meal.get("prep_time_min", 0),
        cook_time_min=meal.get("cook_time_min", 0),
        total_time_min=(meal.get("prep_time_min", 0) + meal.get("cook_time_min", 0)),
        servings=meal.get("servings", 1),
        nutrition_info=meal.get("nutrition_estimate", {}),
        difficulty=meal.get("difficulty", "easy"),
        tags=[meal.get("meal_type", ""), meal.get("category", "")],
        flavor_profile=meal.get("flavor_profile", []),
        dietary_tags=meal.get("dietary_tags", []),
        cuisine=cuisine,
        health_benefits=health,
        is_ai_generated=False,
        protein_type=_classify_proteins(meal.get("ingredients", [])),
        carb_type=_classify_carbs(meal.get("ingredients", [])),
    )


ALL_MEALS = SEED_MEALS + GLOBAL_MEALS


def seed_recipes():
    init_db()
    db = SessionLocal()
    try:
        added = 0
        updated = 0
        for meal in ALL_MEALS:
            existing = db.query(Recipe).filter(Recipe.title == meal["title"]).first()
            if existing:
                needs_update = (
                    not existing.cuisine
                    or existing.cuisine == "american"
                    or not existing.health_benefits
                )
                if needs_update:
                    cuisine = meal.get("cuisine") or _guess_cuisine(meal["title"])
                    benefits = meal.get("health_benefits") or compute_health_benefits(
                        meal.get("ingredients", [])
                    )
                    existing.cuisine = cuisine
                    existing.health_benefits = benefits
                    if meal.get("nutrition_estimate"):
                        existing.nutrition_info = meal["nutrition_estimate"]
                    updated += 1
                # Always refresh protein / carb tags
                existing.protein_type = _classify_proteins(meal.get("ingredients", []))
                existing.carb_type = _classify_carbs(meal.get("ingredients", []))
                continue

            db.add(_build_recipe(meal))
            added += 1

        db.commit()
        print(f"Seeded {added} new + updated {updated} existing ({len(ALL_MEALS)} total definitions).")
    finally:
        db.close()


if __name__ == "__main__":
    seed_recipes()
