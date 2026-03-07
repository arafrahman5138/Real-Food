#!/usr/bin/env python3
"""
Curated Side Library – a set of high-fiber, low-sugar veggie/salad sides
used by the import MES-rescue flow and the pairing suggestion endpoint.

Usage:
  cd backend
  PYTHONPATH=. python3 seed_side_library.py          # insert only new sides
  PYTHONPATH=. python3 seed_side_library.py --force   # upsert all sides
"""

from __future__ import annotations

import argparse
import uuid

from app.db import SessionLocal, init_db
from app.models.recipe import Recipe

# ──────────────────────────────────────────────────────────────────────
# Curated sides: each entry is a dict matching Recipe columns.
# Designed for MES-rescue: high fiber, low sugar, real ingredients.
# ──────────────────────────────────────────────────────────────────────

SIDE_LIBRARY: list[dict] = [
    # ── Veggie Sides ─────────────────────────────────────────────────
    {
        "title": "Steamed Broccoli with Lemon",
        "description": "Simple steamed broccoli finished with fresh lemon juice and a drizzle of extra virgin olive oil.",
        "ingredients": [
            {"name": "broccoli florets", "quantity": "3", "unit": "cups", "category": "produce"},
            {"name": "lemon juice", "quantity": "1", "unit": "tbsp", "category": "produce"},
            {"name": "extra virgin olive oil", "quantity": "1", "unit": "tsp", "category": "fats"},
            {"name": "sea salt", "quantity": "", "unit": "pinch", "category": "spices"},
        ],
        "steps": ["Step 1: Steam broccoli for 4-5 minutes until bright green and tender-crisp.", "Step 2: Toss with lemon juice, olive oil, and salt. Serve warm."],
        "prep_time_min": 3, "cook_time_min": 5, "total_time_min": 8, "servings": 2,
        "nutrition_info": {"calories": 65, "protein": 4.5, "carbs": 8.0, "fat": 2.5, "fiber": 5.0, "sugar": 2.0, "sodium_mg": 150},
        "difficulty": "easy",
        "tags": ["side", "quick", "veg_side", "whole-food"],
        "flavor_profile": ["savory", "tangy"],
        "dietary_tags": ["vegetarian", "dairy-free", "gluten-free"],
        "cuisine": "global",
        "health_benefits": ["High fiber", "Rich in vitamin C", "Anti-inflammatory"],
        "protein_type": [], "carb_type": [],
        "recipe_role": "veg_side", "is_component": True, "is_mes_scoreable": False,
    },
    {
        "title": "Roasted Asparagus with Garlic",
        "description": "Tender asparagus spears roasted with garlic and finished with a squeeze of lemon.",
        "ingredients": [
            {"name": "asparagus", "quantity": "1", "unit": "bunch", "category": "produce"},
            {"name": "garlic cloves", "quantity": "3", "unit": "", "category": "produce"},
            {"name": "extra virgin olive oil", "quantity": "1", "unit": "tbsp", "category": "fats"},
            {"name": "sea salt", "quantity": "", "unit": "pinch", "category": "spices"},
            {"name": "black pepper", "quantity": "", "unit": "pinch", "category": "spices"},
        ],
        "steps": ["Step 1: Preheat oven to 400°F. Trim asparagus and toss with olive oil, garlic, salt, and pepper.", "Step 2: Roast 12-15 minutes until tender with crisp edges."],
        "prep_time_min": 5, "cook_time_min": 15, "total_time_min": 20, "servings": 2,
        "nutrition_info": {"calories": 55, "protein": 3.5, "carbs": 6.0, "fat": 3.0, "fiber": 4.0, "sugar": 1.5, "sodium_mg": 120},
        "difficulty": "easy",
        "tags": ["side", "quick", "veg_side", "whole-food"],
        "flavor_profile": ["savory"],
        "dietary_tags": ["vegetarian", "dairy-free", "gluten-free"],
        "cuisine": "mediterranean",
        "health_benefits": ["High fiber", "Rich in folate", "Anti-inflammatory"],
        "protein_type": [], "carb_type": [],
        "recipe_role": "veg_side", "is_component": True, "is_mes_scoreable": False,
    },
    {
        "title": "Mediterranean Cucumber Tomato Salad",
        "description": "Crisp cucumber and ripe tomatoes with red onion, fresh herbs, and a bright olive oil dressing.",
        "ingredients": [
            {"name": "cucumber", "quantity": "2", "unit": "", "category": "produce"},
            {"name": "roma tomatoes", "quantity": "3", "unit": "", "category": "produce"},
            {"name": "red onion", "quantity": "0.5", "unit": "", "category": "produce"},
            {"name": "fresh parsley", "quantity": "0.25", "unit": "cup", "category": "produce"},
            {"name": "extra virgin olive oil", "quantity": "2", "unit": "tbsp", "category": "fats"},
            {"name": "lemon juice", "quantity": "1", "unit": "tbsp", "category": "produce"},
            {"name": "sea salt", "quantity": "", "unit": "pinch", "category": "spices"},
        ],
        "steps": ["Step 1: Dice cucumber, tomatoes, and red onion. Chop parsley.", "Step 2: Toss with olive oil, lemon juice, and salt. Chill 10 minutes before serving."],
        "prep_time_min": 10, "cook_time_min": 0, "total_time_min": 10, "servings": 2,
        "nutrition_info": {"calories": 95, "protein": 2.0, "carbs": 9.0, "fat": 7.0, "fiber": 3.5, "sugar": 4.0, "sodium_mg": 180},
        "difficulty": "easy",
        "tags": ["side", "quick", "veg_side", "salad", "whole-food"],
        "flavor_profile": ["tangy", "savory"],
        "dietary_tags": ["vegetarian", "dairy-free", "gluten-free"],
        "cuisine": "mediterranean",
        "health_benefits": ["Rich in vitamin C", "Hydrating", "Antioxidant-rich"],
        "protein_type": [], "carb_type": [],
        "recipe_role": "veg_side", "is_component": True, "is_mes_scoreable": False,
    },
    {
        "title": "Sautéed Spinach with Garlic",
        "description": "Quick-wilted baby spinach with aromatic garlic in extra virgin olive oil.",
        "ingredients": [
            {"name": "baby spinach", "quantity": "6", "unit": "cups", "category": "produce"},
            {"name": "garlic cloves", "quantity": "3", "unit": "", "category": "produce"},
            {"name": "extra virgin olive oil", "quantity": "1", "unit": "tbsp", "category": "fats"},
            {"name": "sea salt", "quantity": "", "unit": "pinch", "category": "spices"},
            {"name": "lemon juice", "quantity": "1", "unit": "tsp", "category": "produce"},
        ],
        "steps": ["Step 1: Heat olive oil in a pan over medium heat. Sauté garlic 30 seconds.", "Step 2: Add spinach and cook 2-3 minutes until wilted. Season with salt and lemon juice."],
        "prep_time_min": 2, "cook_time_min": 4, "total_time_min": 6, "servings": 2,
        "nutrition_info": {"calories": 50, "protein": 3.5, "carbs": 4.0, "fat": 3.5, "fiber": 3.0, "sugar": 0.5, "sodium_mg": 200},
        "difficulty": "easy",
        "tags": ["side", "quick", "veg_side", "whole-food"],
        "flavor_profile": ["savory"],
        "dietary_tags": ["vegetarian", "dairy-free", "gluten-free"],
        "cuisine": "mediterranean",
        "health_benefits": ["High iron", "Rich in folate", "Rich in vitamin K"],
        "protein_type": [], "carb_type": [],
        "recipe_role": "veg_side", "is_component": True, "is_mes_scoreable": False,
    },
    {
        "title": "Roasted Cauliflower with Turmeric",
        "description": "Golden cauliflower florets roasted with turmeric and cumin for an anti-inflammatory side.",
        "ingredients": [
            {"name": "cauliflower florets", "quantity": "3", "unit": "cups", "category": "produce"},
            {"name": "extra virgin olive oil", "quantity": "1", "unit": "tbsp", "category": "fats"},
            {"name": "turmeric powder", "quantity": "0.5", "unit": "tsp", "category": "spices"},
            {"name": "cumin powder", "quantity": "0.25", "unit": "tsp", "category": "spices"},
            {"name": "sea salt", "quantity": "", "unit": "pinch", "category": "spices"},
            {"name": "black pepper", "quantity": "", "unit": "pinch", "category": "spices"},
        ],
        "steps": ["Step 1: Preheat oven to 425°F. Toss cauliflower with olive oil, turmeric, cumin, salt, and pepper.", "Step 2: Spread on a baking sheet and roast 25 minutes until golden and tender."],
        "prep_time_min": 5, "cook_time_min": 25, "total_time_min": 30, "servings": 2,
        "nutrition_info": {"calories": 85, "protein": 3.0, "carbs": 9.0, "fat": 5.0, "fiber": 4.5, "sugar": 3.0, "sodium_mg": 160},
        "difficulty": "easy",
        "tags": ["side", "quick", "veg_side", "whole-food"],
        "flavor_profile": ["savory", "spicy"],
        "dietary_tags": ["vegetarian", "dairy-free", "gluten-free"],
        "cuisine": "indian",
        "health_benefits": ["Anti-inflammatory", "High fiber", "Rich in vitamin C"],
        "protein_type": [], "carb_type": [],
        "recipe_role": "veg_side", "is_component": True, "is_mes_scoreable": False,
    },
    {
        "title": "Mixed Green Salad with Avocado",
        "description": "Fresh mixed greens with creamy avocado, cherry tomatoes, and a simple olive oil vinaigrette.",
        "ingredients": [
            {"name": "mixed salad greens", "quantity": "4", "unit": "cups", "category": "produce"},
            {"name": "avocado", "quantity": "0.5", "unit": "", "category": "produce"},
            {"name": "cherry tomatoes", "quantity": "0.5", "unit": "cup", "category": "produce"},
            {"name": "extra virgin olive oil", "quantity": "1", "unit": "tbsp", "category": "fats"},
            {"name": "apple cider vinegar", "quantity": "1", "unit": "tsp", "category": "produce"},
            {"name": "sea salt", "quantity": "", "unit": "pinch", "category": "spices"},
        ],
        "steps": ["Step 1: Arrange greens on plates. Slice avocado and halve cherry tomatoes.", "Step 2: Top greens with avocado and tomatoes. Drizzle with olive oil and vinegar. Season with salt."],
        "prep_time_min": 5, "cook_time_min": 0, "total_time_min": 5, "servings": 2,
        "nutrition_info": {"calories": 130, "protein": 2.5, "carbs": 8.0, "fat": 11.0, "fiber": 6.0, "sugar": 2.0, "sodium_mg": 130},
        "difficulty": "easy",
        "tags": ["side", "quick", "veg_side", "salad", "whole-food"],
        "flavor_profile": ["savory", "tangy"],
        "dietary_tags": ["vegetarian", "dairy-free", "gluten-free"],
        "cuisine": "global",
        "health_benefits": ["High fiber", "Heart-healthy fats", "Rich in potassium"],
        "protein_type": [], "carb_type": [],
        "recipe_role": "veg_side", "is_component": True, "is_mes_scoreable": False,
    },
    {
        "title": "Korean Sesame Cucumber Salad",
        "description": "Crunchy cucumbers in a gochugaru-sesame dressing — perfect alongside any Asian-inspired meal.",
        "ingredients": [
            {"name": "cucumber", "quantity": "2", "unit": "", "category": "produce"},
            {"name": "sesame oil", "quantity": "1", "unit": "tsp", "category": "fats"},
            {"name": "rice vinegar", "quantity": "1", "unit": "tbsp", "category": "produce"},
            {"name": "gochugaru", "quantity": "0.5", "unit": "tsp", "category": "spices"},
            {"name": "toasted sesame seeds", "quantity": "1", "unit": "tsp", "category": "produce"},
            {"name": "sea salt", "quantity": "", "unit": "pinch", "category": "spices"},
        ],
        "steps": ["Step 1: Slice cucumbers thinly. Toss with sesame oil, rice vinegar, gochugaru, and salt.", "Step 2: Garnish with sesame seeds. Serve chilled."],
        "prep_time_min": 5, "cook_time_min": 0, "total_time_min": 5, "servings": 2,
        "nutrition_info": {"calories": 40, "protein": 1.5, "carbs": 5.0, "fat": 2.0, "fiber": 2.5, "sugar": 2.5, "sodium_mg": 160},
        "difficulty": "easy",
        "tags": ["side", "quick", "veg_side", "salad", "whole-food"],
        "flavor_profile": ["spicy", "tangy"],
        "dietary_tags": ["vegetarian", "dairy-free", "gluten-free"],
        "cuisine": "korean",
        "health_benefits": ["Hydrating", "Low calorie", "Rich in vitamin K"],
        "protein_type": [], "carb_type": [],
        "recipe_role": "veg_side", "is_component": True, "is_mes_scoreable": False,
    },
    {
        "title": "Roasted Sweet Potato Wedges",
        "description": "Crispy-edged sweet potato wedges with smoked paprika — fiber-rich and naturally sweet.",
        "ingredients": [
            {"name": "sweet potatoes", "quantity": "2", "unit": "medium", "category": "produce"},
            {"name": "avocado oil", "quantity": "1", "unit": "tbsp", "category": "fats"},
            {"name": "smoked paprika", "quantity": "0.5", "unit": "tsp", "category": "spices"},
            {"name": "garlic powder", "quantity": "0.25", "unit": "tsp", "category": "spices"},
            {"name": "sea salt", "quantity": "", "unit": "pinch", "category": "spices"},
        ],
        "steps": ["Step 1: Preheat oven to 425°F. Cut sweet potatoes into wedges and toss with oil and spices.", "Step 2: Spread on baking sheet and roast 30 minutes, flipping halfway, until crispy."],
        "prep_time_min": 5, "cook_time_min": 30, "total_time_min": 35, "servings": 2,
        "nutrition_info": {"calories": 160, "protein": 2.5, "carbs": 28.0, "fat": 5.0, "fiber": 5.5, "sugar": 6.0, "sodium_mg": 180},
        "difficulty": "easy",
        "tags": ["side", "quick", "veg_side", "whole-food"],
        "flavor_profile": ["sweet", "savory"],
        "dietary_tags": ["vegetarian", "dairy-free", "gluten-free"],
        "cuisine": "american",
        "health_benefits": ["High fiber", "Rich in vitamin A", "Complex carbs"],
        "protein_type": [], "carb_type": ["sweet_potato"],
        "recipe_role": "veg_side", "is_component": True, "is_mes_scoreable": False,
    },
    {
        "title": "Kale and White Bean Salad",
        "description": "Hearty massaged kale with cannellini beans, lemon, and olive oil — a protein and fiber powerhouse side.",
        "ingredients": [
            {"name": "lacinato kale", "quantity": "4", "unit": "cups", "category": "produce"},
            {"name": "cannellini beans", "quantity": "0.5", "unit": "cup", "category": "produce"},
            {"name": "extra virgin olive oil", "quantity": "1", "unit": "tbsp", "category": "fats"},
            {"name": "lemon juice", "quantity": "1", "unit": "tbsp", "category": "produce"},
            {"name": "garlic clove", "quantity": "1", "unit": "", "category": "produce"},
            {"name": "sea salt", "quantity": "", "unit": "pinch", "category": "spices"},
        ],
        "steps": ["Step 1: De-stem kale and chop. Massage with olive oil and lemon juice for 2 minutes until tender.", "Step 2: Toss with beans, minced garlic, and salt. Let rest 5 minutes before serving."],
        "prep_time_min": 10, "cook_time_min": 0, "total_time_min": 10, "servings": 2,
        "nutrition_info": {"calories": 145, "protein": 7.5, "carbs": 16.0, "fat": 6.0, "fiber": 7.0, "sugar": 1.5, "sodium_mg": 190},
        "difficulty": "easy",
        "tags": ["side", "quick", "veg_side", "salad", "whole-food"],
        "flavor_profile": ["savory", "tangy"],
        "dietary_tags": ["vegetarian", "dairy-free", "gluten-free"],
        "cuisine": "mediterranean",
        "health_benefits": ["High fiber", "High iron", "Rich in vitamin K", "Plant protein"],
        "protein_type": ["vegetarian"], "carb_type": [],
        "recipe_role": "veg_side", "is_component": True, "is_mes_scoreable": False,
    },
    {
        "title": "Steamed Green Beans with Almonds",
        "description": "Tender green beans topped with toasted sliced almonds and a touch of garlic butter.",
        "ingredients": [
            {"name": "green beans", "quantity": "2", "unit": "cups", "category": "produce"},
            {"name": "sliced almonds", "quantity": "2", "unit": "tbsp", "category": "produce"},
            {"name": "grass-fed butter", "quantity": "1", "unit": "tsp", "category": "dairy"},
            {"name": "garlic clove", "quantity": "1", "unit": "", "category": "produce"},
            {"name": "sea salt", "quantity": "", "unit": "pinch", "category": "spices"},
        ],
        "steps": ["Step 1: Steam green beans for 5 minutes until bright green.", "Step 2: Melt butter in pan, toast almonds and garlic 2 minutes. Toss with beans and salt."],
        "prep_time_min": 3, "cook_time_min": 7, "total_time_min": 10, "servings": 2,
        "nutrition_info": {"calories": 80, "protein": 3.5, "carbs": 8.0, "fat": 4.5, "fiber": 4.0, "sugar": 2.0, "sodium_mg": 140},
        "difficulty": "easy",
        "tags": ["side", "quick", "veg_side", "whole-food"],
        "flavor_profile": ["savory"],
        "dietary_tags": ["vegetarian", "gluten-free"],
        "cuisine": "american",
        "health_benefits": ["High fiber", "Rich in vitamin C", "Good source of vitamin E"],
        "protein_type": [], "carb_type": [],
        "recipe_role": "veg_side", "is_component": True, "is_mes_scoreable": False,
    },
    {
        "title": "Charred Zucchini with Herbs",
        "description": "Pan-charred zucchini with fresh herbs and a splash of balsamic — summer in a side dish.",
        "ingredients": [
            {"name": "zucchini", "quantity": "2", "unit": "medium", "category": "produce"},
            {"name": "extra virgin olive oil", "quantity": "1", "unit": "tbsp", "category": "fats"},
            {"name": "fresh basil", "quantity": "2", "unit": "tbsp", "category": "produce"},
            {"name": "balsamic vinegar", "quantity": "1", "unit": "tsp", "category": "produce"},
            {"name": "sea salt", "quantity": "", "unit": "pinch", "category": "spices"},
        ],
        "steps": ["Step 1: Slice zucchini into half-moons. Heat olive oil in skillet over high heat.", "Step 2: Cook zucchini 3-4 minutes per side until charred. Top with basil and balsamic."],
        "prep_time_min": 5, "cook_time_min": 8, "total_time_min": 13, "servings": 2,
        "nutrition_info": {"calories": 70, "protein": 2.0, "carbs": 6.0, "fat": 5.0, "fiber": 2.5, "sugar": 3.0, "sodium_mg": 130},
        "difficulty": "easy",
        "tags": ["side", "quick", "veg_side", "whole-food"],
        "flavor_profile": ["savory", "tangy"],
        "dietary_tags": ["vegetarian", "dairy-free", "gluten-free"],
        "cuisine": "mediterranean",
        "health_benefits": ["Low calorie", "Rich in vitamin C", "Good potassium"],
        "protein_type": [], "carb_type": [],
        "recipe_role": "veg_side", "is_component": True, "is_mes_scoreable": False,
    },
    {
        "title": "Black Bean and Corn Salad",
        "description": "Protein-packed black beans with sweet corn, cilantro, and lime — a fiber-rich Tex-Mex side.",
        "ingredients": [
            {"name": "black beans", "quantity": "1", "unit": "cup", "category": "produce"},
            {"name": "corn kernels", "quantity": "0.5", "unit": "cup", "category": "produce"},
            {"name": "red bell pepper", "quantity": "0.5", "unit": "", "category": "produce"},
            {"name": "cilantro", "quantity": "2", "unit": "tbsp", "category": "produce"},
            {"name": "lime juice", "quantity": "1", "unit": "tbsp", "category": "produce"},
            {"name": "extra virgin olive oil", "quantity": "1", "unit": "tsp", "category": "fats"},
            {"name": "sea salt", "quantity": "", "unit": "pinch", "category": "spices"},
        ],
        "steps": ["Step 1: Drain and rinse black beans. Dice bell pepper.", "Step 2: Toss all ingredients together. Chill 10 minutes before serving."],
        "prep_time_min": 8, "cook_time_min": 0, "total_time_min": 8, "servings": 2,
        "nutrition_info": {"calories": 165, "protein": 9.0, "carbs": 26.0, "fat": 3.0, "fiber": 9.0, "sugar": 3.0, "sodium_mg": 200},
        "difficulty": "easy",
        "tags": ["side", "quick", "veg_side", "salad", "whole-food"],
        "flavor_profile": ["tangy", "savory"],
        "dietary_tags": ["vegetarian", "dairy-free", "gluten-free"],
        "cuisine": "mexican",
        "health_benefits": ["High fiber", "Plant protein", "Rich in folate"],
        "protein_type": ["vegetarian"], "carb_type": [],
        "recipe_role": "veg_side", "is_component": True, "is_mes_scoreable": False,
    },
    {
        "title": "Roasted Brussels Sprouts with Balsamic",
        "description": "Caramelized Brussels sprouts with a balsamic glaze — crispy edges, tender centers.",
        "ingredients": [
            {"name": "Brussels sprouts", "quantity": "2", "unit": "cups", "category": "produce"},
            {"name": "extra virgin olive oil", "quantity": "1", "unit": "tbsp", "category": "fats"},
            {"name": "balsamic vinegar", "quantity": "1", "unit": "tbsp", "category": "produce"},
            {"name": "sea salt", "quantity": "", "unit": "pinch", "category": "spices"},
            {"name": "black pepper", "quantity": "", "unit": "pinch", "category": "spices"},
        ],
        "steps": ["Step 1: Preheat oven to 400°F. Halve Brussels sprouts and toss with olive oil, salt, and pepper.", "Step 2: Roast 25 minutes until golden. Drizzle with balsamic vinegar and serve."],
        "prep_time_min": 5, "cook_time_min": 25, "total_time_min": 30, "servings": 2,
        "nutrition_info": {"calories": 90, "protein": 4.0, "carbs": 10.0, "fat": 5.0, "fiber": 5.0, "sugar": 3.0, "sodium_mg": 150},
        "difficulty": "easy",
        "tags": ["side", "quick", "veg_side", "whole-food"],
        "flavor_profile": ["savory", "tangy"],
        "dietary_tags": ["vegetarian", "dairy-free", "gluten-free"],
        "cuisine": "american",
        "health_benefits": ["High fiber", "Rich in vitamin C", "Rich in vitamin K"],
        "protein_type": [], "carb_type": [],
        "recipe_role": "veg_side", "is_component": True, "is_mes_scoreable": False,
    },
    {
        "title": "Lentil Tabbouleh",
        "description": "A fiber-and-protein-rich twist on classic tabbouleh using green lentils instead of bulgur.",
        "ingredients": [
            {"name": "cooked green lentils", "quantity": "1", "unit": "cup", "category": "produce"},
            {"name": "cucumber", "quantity": "1", "unit": "", "category": "produce"},
            {"name": "cherry tomatoes", "quantity": "0.5", "unit": "cup", "category": "produce"},
            {"name": "fresh parsley", "quantity": "0.5", "unit": "cup", "category": "produce"},
            {"name": "fresh mint", "quantity": "2", "unit": "tbsp", "category": "produce"},
            {"name": "extra virgin olive oil", "quantity": "1", "unit": "tbsp", "category": "fats"},
            {"name": "lemon juice", "quantity": "2", "unit": "tbsp", "category": "produce"},
            {"name": "sea salt", "quantity": "", "unit": "pinch", "category": "spices"},
        ],
        "steps": ["Step 1: Dice cucumber and halve cherry tomatoes. Chop parsley and mint.", "Step 2: Combine lentils, vegetables, and herbs. Dress with olive oil and lemon juice. Season with salt."],
        "prep_time_min": 12, "cook_time_min": 0, "total_time_min": 12, "servings": 2,
        "nutrition_info": {"calories": 175, "protein": 10.0, "carbs": 22.0, "fat": 5.5, "fiber": 9.5, "sugar": 3.0, "sodium_mg": 170},
        "difficulty": "easy",
        "tags": ["side", "quick", "veg_side", "salad", "whole-food"],
        "flavor_profile": ["tangy", "savory"],
        "dietary_tags": ["vegetarian", "dairy-free", "gluten-free"],
        "cuisine": "middle_eastern",
        "health_benefits": ["High fiber", "High iron", "Plant protein", "Rich in folate"],
        "protein_type": ["vegetarian"], "carb_type": [],
        "recipe_role": "veg_side", "is_component": True, "is_mes_scoreable": False,
    },
    {
        "title": "Stir-Fried Bok Choy with Ginger",
        "description": "Quick-cooked baby bok choy with fresh ginger and a splash of coconut aminos.",
        "ingredients": [
            {"name": "baby bok choy", "quantity": "4", "unit": "heads", "category": "produce"},
            {"name": "fresh ginger", "quantity": "1", "unit": "tsp", "category": "produce"},
            {"name": "garlic clove", "quantity": "1", "unit": "", "category": "produce"},
            {"name": "sesame oil", "quantity": "1", "unit": "tsp", "category": "fats"},
            {"name": "coconut aminos", "quantity": "1", "unit": "tsp", "category": "produce"},
        ],
        "steps": ["Step 1: Halve bok choy lengthwise. Mince ginger and garlic.", "Step 2: Heat sesame oil in wok. Stir-fry garlic and ginger 30 seconds, add bok choy, cook 3 minutes. Drizzle with coconut aminos."],
        "prep_time_min": 3, "cook_time_min": 4, "total_time_min": 7, "servings": 2,
        "nutrition_info": {"calories": 35, "protein": 2.5, "carbs": 3.5, "fat": 1.5, "fiber": 2.0, "sugar": 1.0, "sodium_mg": 140},
        "difficulty": "easy",
        "tags": ["side", "quick", "veg_side", "whole-food"],
        "flavor_profile": ["savory", "umami"],
        "dietary_tags": ["vegetarian", "dairy-free", "gluten-free"],
        "cuisine": "chinese",
        "health_benefits": ["Low calorie", "Rich in vitamin A", "Rich in vitamin C"],
        "protein_type": [], "carb_type": [],
        "recipe_role": "veg_side", "is_component": True, "is_mes_scoreable": False,
    },
]


def seed_side_library(force: bool = False) -> dict[str, int]:
    """Insert curated side recipes. Returns counts of inserted/skipped."""
    init_db()
    db = SessionLocal()

    inserted = 0
    skipped = 0

    try:
        for side in SIDE_LIBRARY:
            existing = db.query(Recipe).filter(Recipe.title == side["title"]).first()
            if existing:
                if force:
                    for k, v in side.items():
                        setattr(existing, k, v)
                    inserted += 1
                else:
                    skipped += 1
                continue

            db.add(Recipe(id=str(uuid.uuid4()), **side))
            inserted += 1

        db.commit()
    finally:
        db.close()

    return {"inserted": inserted, "skipped": skipped}


def get_side_library_ids(db) -> list[str]:
    """Return IDs of all side-library recipes (veg_side + is_component)."""
    sides = (
        db.query(Recipe.id)
        .filter(Recipe.recipe_role == "veg_side", Recipe.is_component == True)
        .all()
    )
    return [str(s.id) for s in sides]


def get_side_library_with_nutrition(db) -> list[dict]:
    """Return side library records with nutrition for MES-rescue scoring."""
    sides = (
        db.query(Recipe)
        .filter(Recipe.recipe_role == "veg_side", Recipe.is_component == True)
        .all()
    )
    return [
        {
            "id": str(s.id),
            "title": s.title,
            "nutrition_info": s.nutrition_info or {},
            "cuisine": s.cuisine,
            "tags": s.tags or [],
            "fiber_g": float((s.nutrition_info or {}).get("fiber", 0)),
        }
        for s in sides
    ]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed curated side library")
    parser.add_argument("--force", action="store_true", help="Upsert all sides (overwrite existing)")
    args = parser.parse_args()

    result = seed_side_library(force=args.force)
    print(f"Side library seeded: {result}")
