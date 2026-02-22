"""
Deterministic ingredient-to-health-benefit mapping.
No LLM calls — pure dictionary lookup at seed time.
"""
from typing import List, Set

INGREDIENT_HEALTH_MAP: dict[str, list[str]] = {
    # ── Gut Health ────────────────────────────────────────────────────────
    "bone broth": ["gut_health", "bone_health"],
    "chicken bone broth": ["gut_health", "bone_health"],
    "beef bone broth": ["gut_health", "bone_health"],
    "ginger": ["gut_health", "anti_inflammatory", "immune_support"],
    "fresh ginger": ["gut_health", "anti_inflammatory", "immune_support"],
    "yogurt": ["gut_health", "bone_health"],
    "greek yogurt": ["gut_health", "bone_health", "muscle_recovery"],
    "full-fat greek yogurt": ["gut_health", "bone_health", "muscle_recovery"],
    "kimchi": ["gut_health", "immune_support"],
    "sauerkraut": ["gut_health", "immune_support"],
    "miso paste": ["gut_health", "immune_support"],
    "white miso paste": ["gut_health", "immune_support"],
    "apple cider vinegar": ["gut_health", "blood_sugar"],
    "coconut milk": ["energy_boost"],
    "full-fat coconut milk": ["energy_boost"],
    "chia seeds": ["gut_health", "heart_health", "energy_boost"],

    # ── Anti-Inflammatory ─────────────────────────────────────────────────
    "turmeric": ["anti_inflammatory", "brain_health", "immune_support"],
    "salmon": ["anti_inflammatory", "heart_health", "brain_health"],
    "wild-caught salmon": ["anti_inflammatory", "heart_health", "brain_health"],
    "sushi-grade salmon": ["anti_inflammatory", "heart_health", "brain_health"],
    "sardines": ["anti_inflammatory", "heart_health", "bone_health"],
    "wild-caught sardines in olive oil": ["anti_inflammatory", "heart_health", "bone_health"],
    "mackerel": ["anti_inflammatory", "heart_health", "brain_health"],
    "smoked mackerel fillets": ["anti_inflammatory", "heart_health", "brain_health"],
    "extra virgin olive oil": ["anti_inflammatory", "heart_health"],
    "blueberries": ["anti_inflammatory", "brain_health"],
    "mixed berries": ["anti_inflammatory", "brain_health"],
    "cinnamon": ["anti_inflammatory", "blood_sugar"],
    "fresh rosemary": ["anti_inflammatory"],
    "fresh thyme": ["anti_inflammatory", "immune_support"],
    "fresh oregano": ["anti_inflammatory", "immune_support"],
    "dried oregano": ["anti_inflammatory", "immune_support"],
    "black pepper": ["anti_inflammatory"],
    "cacao powder": ["anti_inflammatory", "brain_health"],
    "dark chocolate": ["anti_inflammatory", "brain_health"],
    "85% dark chocolate": ["anti_inflammatory", "brain_health"],

    # ── Heart Health ──────────────────────────────────────────────────────
    "avocado": ["heart_health", "skin_health"],
    "walnuts": ["heart_health", "brain_health"],
    "almonds": ["heart_health", "bone_health"],
    "raw almonds": ["heart_health", "bone_health"],
    "almond butter": ["heart_health", "energy_boost"],
    "cashews": ["heart_health"],
    "raw cashews": ["heart_health"],
    "flaxseed": ["heart_health", "hormone_support"],
    "hemp seeds": ["heart_health", "muscle_recovery"],
    "oats": ["heart_health", "energy_boost"],
    "rolled oats": ["heart_health", "energy_boost"],
    "steel-cut oats": ["heart_health", "energy_boost"],
    "olive oil": ["heart_health", "anti_inflammatory"],
    "tahini": ["heart_health", "bone_health"],
    "pine nuts": ["heart_health"],
    "pecans": ["heart_health"],
    "beets": ["heart_health", "detox_support", "energy_boost"],
    "roasted beets": ["heart_health", "detox_support", "energy_boost"],
    "lentils": ["heart_health", "blood_sugar", "energy_boost"],
    "red lentils": ["heart_health", "blood_sugar", "energy_boost"],
    "yellow lentils": ["heart_health", "blood_sugar", "energy_boost"],
    "chickpeas": ["heart_health", "blood_sugar", "energy_boost"],
    "black beans": ["heart_health", "blood_sugar", "energy_boost"],
    "kidney beans": ["heart_health", "blood_sugar"],
    "white beans": ["heart_health", "blood_sugar"],

    # ── Immune Support ────────────────────────────────────────────────────
    "garlic": ["immune_support", "heart_health"],
    "lemon": ["immune_support", "detox_support", "skin_health"],
    "lime": ["immune_support", "detox_support"],
    "spinach": ["immune_support", "bone_health", "energy_boost"],
    "fresh spinach": ["immune_support", "bone_health", "energy_boost"],
    "kale": ["immune_support", "bone_health", "detox_support"],
    "lacinato kale": ["immune_support", "bone_health", "detox_support"],
    "mushrooms": ["immune_support"],
    "mixed mushrooms": ["immune_support"],
    "bell pepper": ["immune_support", "skin_health"],
    "red bell pepper": ["immune_support", "skin_health"],
    "bell peppers": ["immune_support", "skin_health"],
    "citrus": ["immune_support", "skin_health"],
    "grapefruit": ["immune_support", "skin_health"],
    "orange": ["immune_support", "skin_health"],

    # ── Brain Health ──────────────────────────────────────────────────────
    "eggs": ["brain_health", "muscle_recovery"],
    "egg": ["brain_health", "muscle_recovery"],
    "egg whites": ["muscle_recovery"],
    "hard-boiled eggs": ["brain_health", "muscle_recovery"],
    "fatty fish": ["brain_health", "anti_inflammatory"],
    "trout": ["brain_health", "anti_inflammatory"],
    "whole trout": ["brain_health", "anti_inflammatory"],
    "cod": ["brain_health"],
    "cod fillets": ["brain_health"],

    # ── Bone & Joint ──────────────────────────────────────────────────────
    "collard green leaves": ["bone_health", "detox_support"],
    "goat cheese": ["bone_health"],
    "feta cheese": ["bone_health"],
    "parmesan cheese": ["bone_health"],
    "fresh mozzarella": ["bone_health"],
    "mozzarella cheese": ["bone_health"],
    "cheddar cheese": ["bone_health"],
    "cream cheese": ["bone_health"],
    "grass-fed butter": ["bone_health"],

    # ── Muscle Recovery ───────────────────────────────────────────────────
    "chicken breast": ["muscle_recovery"],
    "chicken thighs": ["muscle_recovery"],
    "chicken thighs (boneless)": ["muscle_recovery"],
    "bone-in chicken thighs": ["muscle_recovery"],
    "chicken tenders": ["muscle_recovery"],
    "chicken drumsticks": ["muscle_recovery"],
    "ground chicken": ["muscle_recovery"],
    "ground turkey": ["muscle_recovery"],
    "sliced turkey breast": ["muscle_recovery"],
    "turkey breast": ["muscle_recovery"],
    "grass-fed ground beef": ["muscle_recovery", "energy_boost"],
    "grass-fed flank steak": ["muscle_recovery", "energy_boost"],
    "grass-fed ribeye steak": ["muscle_recovery", "energy_boost"],
    "beef stew meat": ["muscle_recovery", "energy_boost"],
    "beef short ribs": ["muscle_recovery"],
    "ground bison": ["muscle_recovery", "energy_boost"],
    "ground lamb": ["muscle_recovery"],
    "lamb loin chops": ["muscle_recovery"],
    "lamb stew meat": ["muscle_recovery"],
    "pork shoulder": ["muscle_recovery"],
    "pork tenderloin": ["muscle_recovery"],
    "bone-in pork chops": ["muscle_recovery"],
    "ground pork": ["muscle_recovery"],
    "shrimp": ["muscle_recovery"],
    "sea scallops": ["muscle_recovery"],
    "wild-caught tuna": ["muscle_recovery", "brain_health"],
    "duck breast": ["muscle_recovery"],
    "Cornish game hens": ["muscle_recovery"],
    "whole chicken": ["muscle_recovery"],
    "edamame": ["muscle_recovery", "hormone_support"],
    "edamame (shelled)": ["muscle_recovery", "hormone_support"],
    "edamame (in pods)": ["muscle_recovery", "hormone_support"],
    "silken tofu": ["muscle_recovery", "hormone_support"],
    "quinoa": ["muscle_recovery", "energy_boost"],

    # ── Energy Boost ──────────────────────────────────────────────────────
    "sweet potato": ["energy_boost", "skin_health"],
    "sweet potatoes": ["energy_boost", "skin_health"],
    "banana": ["energy_boost"],
    "bananas": ["energy_boost"],
    "ripe bananas": ["energy_boost"],
    "brown rice": ["energy_boost"],
    "short-grain brown rice": ["energy_boost"],
    "jasmine rice": ["energy_boost"],
    "wild rice": ["energy_boost"],
    "potatoes": ["energy_boost"],
    "russet potatoes": ["energy_boost"],
    "Medjool dates": ["energy_boost"],
    "maple syrup": ["energy_boost"],
    "raw honey": ["energy_boost", "immune_support"],
    "plantains": ["energy_boost"],
    "ripe plantains": ["energy_boost"],

    # ── Skin Health ───────────────────────────────────────────────────────
    "mango": ["skin_health", "immune_support"],
    "pineapple": ["skin_health", "immune_support"],
    "kiwi": ["skin_health", "immune_support"],
    "watermelon": ["skin_health"],
    "tomato": ["skin_health"],
    "cherry tomatoes": ["skin_health"],
    "carrots": ["skin_health"],
    "pumpkin seeds": ["skin_health", "hormone_support"],

    # ── Blood Sugar Balance ───────────────────────────────────────────────
    "cauliflower": ["blood_sugar", "detox_support"],
    "cauliflower rice": ["blood_sugar", "detox_support"],
    "broccoli": ["blood_sugar", "detox_support", "hormone_support"],
    "broccoli florets": ["blood_sugar", "detox_support", "hormone_support"],
    "zucchini": ["blood_sugar"],
    "snap peas": ["blood_sugar"],
    "green beans": ["blood_sugar"],
    "coconut aminos": ["blood_sugar"],

    # ── Hormone Support ───────────────────────────────────────────────────
    "Brussels sprouts": ["hormone_support", "detox_support"],
    "cabbage": ["hormone_support", "detox_support"],
    "green cabbage": ["hormone_support", "detox_support"],
    "red cabbage": ["hormone_support", "detox_support"],
    "napa cabbage": ["hormone_support", "detox_support"],
    "sesame seeds": ["hormone_support"],
    "sunflower seed butter": ["hormone_support"],
    "coconut oil": ["hormone_support", "energy_boost"],

    # ── Detox & Liver ─────────────────────────────────────────────────────
    "arugula": ["detox_support"],
    "mixed greens": ["detox_support", "immune_support"],
    "butter lettuce": ["detox_support"],
    "romaine lettuce": ["detox_support"],
    "fresh cilantro": ["detox_support"],
    "fresh parsley": ["detox_support", "bone_health"],
    "fresh mint": ["gut_health"],
    "fresh basil": ["anti_inflammatory"],
    "celery": ["detox_support"],
    "cucumber": ["detox_support", "skin_health"],
    "asparagus": ["detox_support"],

    # ── Spices with benefits ──────────────────────────────────────────────
    "cumin": ["gut_health", "blood_sugar"],
    "garam masala": ["anti_inflammatory", "gut_health"],
    "curry powder": ["anti_inflammatory", "brain_health"],
    "smoked paprika": ["anti_inflammatory"],
    "paprika": ["skin_health"],
    "chili powder": ["anti_inflammatory", "energy_boost"],
    "red pepper flakes": ["anti_inflammatory", "energy_boost"],
    "star anise": ["gut_health"],
    "bay leaves": ["gut_health"],
    "nutmeg": ["brain_health"],
    "coriander": ["gut_health", "blood_sugar"],
    "cardamom": ["gut_health", "heart_health"],
    "fenugreek": ["blood_sugar", "hormone_support"],
    "saffron": ["brain_health", "anti_inflammatory"],
    "lemongrass": ["gut_health", "anti_inflammatory"],

    # ── Fermented / cultured ──────────────────────────────────────────────
    "fish sauce": ["gut_health"],
    "coconut yogurt": ["gut_health"],
    "tamarind": ["gut_health", "blood_sugar"],
    "fermented shrimp paste": ["gut_health"],

    # ── Nuts / seeds catch-all ────────────────────────────────────────────
    "peanuts": ["heart_health", "energy_boost"],
    "unsweetened shredded coconut": ["energy_boost"],
    "coconut flour": ["blood_sugar"],
    "almond flour": ["blood_sugar", "heart_health"],

    # ── Organ meats ───────────────────────────────────────────────────────
    "grass-fed beef liver": ["energy_boost", "brain_health", "immune_support"],
}

HEALTH_BENEFIT_LABELS: dict[str, str] = {
    "gut_health": "Gut Health",
    "anti_inflammatory": "Anti-Inflammatory",
    "heart_health": "Heart Health",
    "immune_support": "Immune Support",
    "brain_health": "Brain Health",
    "bone_health": "Bone & Joint",
    "muscle_recovery": "Muscle Recovery",
    "energy_boost": "Energy Boost",
    "skin_health": "Skin Health",
    "blood_sugar": "Blood Sugar Balance",
    "hormone_support": "Hormone Support",
    "detox_support": "Detox & Liver",
}


def compute_health_benefits(ingredients: list[dict]) -> list[str]:
    """Scan a meal's ingredient list and return deduplicated health benefit tags."""
    benefits: Set[str] = set()
    for ing in ingredients:
        name = ing.get("name", "").lower().strip()
        if name in INGREDIENT_HEALTH_MAP:
            benefits.update(INGREDIENT_HEALTH_MAP[name])
        else:
            for keyword, tags in INGREDIENT_HEALTH_MAP.items():
                if keyword in name or name in keyword:
                    benefits.update(tags)
                    break
    return sorted(benefits)
