from __future__ import annotations

import re
from typing import Any


SEED_OILS = {
    "canola oil",
    "soybean oil",
    "sunflower oil",
    "safflower oil",
    "corn oil",
    "cottonseed oil",
    "grapeseed oil",
    "rice bran oil",
    "vegetable oil",
}

ADDED_SUGARS = {
    "sugar",
    "cane sugar",
    "brown sugar",
    "invert sugar",
    "corn syrup",
    "high fructose corn syrup",
    "glucose syrup",
    "fructose",
    "dextrose",
    "maltodextrin",
    "evaporated cane juice",
    "tapioca syrup",
    "rice syrup",
}

REFINED_FLOURS = {
    "enriched wheat flour",
    "bleached wheat flour",
    "wheat flour",
    "white flour",
    "enriched flour",
    "refined flour",
}

ARTIFICIAL_ADDITIVES = {
    "artificial flavor",
    "artificial flavours",
    "artificial flavoring",
    "artificial colouring",
    "artificial coloring",
    "red 40",
    "yellow 5",
    "yellow 6",
    "blue 1",
    "blue 2",
    "sucralose",
    "aspartame",
    "acesulfame potassium",
    "potassium sorbate",
    "sodium benzoate",
    "bht",
    "bha",
    "nitrites",
    "nitrates",
}

EMULSIFIERS_AND_GUMS = {
    "soy lecithin",
    "lecithin",
    "mono and diglycerides",
    "diglycerides",
    "guar gum",
    "xanthan gum",
    "gellan gum",
    "carrageenan",
    "polysorbate 80",
}

PROTEIN_ISOLATES = {
    "soy protein isolate",
    "pea protein isolate",
    "whey protein isolate",
    "milk protein isolate",
}

WHOLE_FOOD_FIRST_INGREDIENT_HINTS = {
    "chicken",
    "beef",
    "turkey",
    "salmon",
    "eggs",
    "oats",
    "almonds",
    "cashews",
    "walnuts",
    "dates",
    "apples",
    "banana",
    "avocado",
    "milk",
    "greek yogurt",
    "lentils",
    "beans",
    "brown rice",
    "sweet potato",
}


def _normalize(text: str | None) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _split_ingredients(ingredients_text: str | None) -> list[str]:
    if not ingredients_text:
        return []
    normalized = _normalize(ingredients_text)
    normalized = normalized.replace("ingredients:", "").strip()
    parts = re.split(r",|\(|\)|;|\.", normalized)
    items = []
    for part in parts:
        item = re.sub(r"\[[^\]]*\]", "", part).strip(" :-")
        if item:
            items.append(item)
    return items


def _find_matches(ingredients: list[str], terms: set[str]) -> list[str]:
    matches: list[str] = []
    for item in ingredients:
        if any(term in item for term in terms):
            matches.append(item)
    seen: set[str] = set()
    deduped: list[str] = []
    for item in matches:
        if item not in seen:
            deduped.append(item)
            seen.add(item)
    return deduped


def _get_float(payload: dict[str, Any], *keys: str) -> float:
    for key in keys:
        value = payload.get(key)
        if value is None or value == "":
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return 0.0


def analyze_whole_food_product(payload: dict[str, Any]) -> dict[str, Any]:
    ingredients = _split_ingredients(payload.get("ingredients_text"))
    ingredient_count = len(ingredients)

    protein_g = _get_float(payload, "protein_g", "protein")
    fiber_g = _get_float(payload, "fiber_g", "fiber")
    sugar_g = _get_float(payload, "sugar_g", "sugar")
    carbs_g = _get_float(payload, "carbs_g", "carbs")
    sodium_mg = _get_float(payload, "sodium_mg", "sodium")
    calories = _get_float(payload, "calories")

    seed_oils = _find_matches(ingredients, SEED_OILS)
    added_sugars = _find_matches(ingredients, ADDED_SUGARS)
    refined_flours = _find_matches(ingredients, REFINED_FLOURS)
    additives = _find_matches(ingredients, ARTIFICIAL_ADDITIVES)
    gums = _find_matches(ingredients, EMULSIFIERS_AND_GUMS)
    isolates = _find_matches(ingredients, PROTEIN_ISOLATES)

    score = 92.0
    highlights: list[str] = []
    concerns: list[str] = []
    reasoning: list[str] = []

    if ingredient_count == 0:
        score -= 14
        concerns.append("Ingredient list is missing, so the product is harder to trust.")
    elif ingredient_count <= 5:
        score += 6
        highlights.append("Very short ingredient list.")
    elif ingredient_count <= 10:
        score += 3
        highlights.append("Relatively short ingredient list.")
    elif ingredient_count > 20:
        score -= 12
        concerns.append("Long ingredient list usually signals a more processed product.")
    elif ingredient_count > 12:
        score -= 6
        concerns.append("Moderately long ingredient list.")

    if seed_oils:
        penalty = min(24, 14 + max(0, len(seed_oils) - 1) * 4)
        score -= penalty
        concerns.append("Contains industrial seed oils.")
        reasoning.append(f"Seed oils found: {', '.join(seed_oils[:3])}.")

    if added_sugars:
        penalty = min(20, 10 + max(0, len(added_sugars) - 1) * 3)
        score -= penalty
        concerns.append("Contains added sugars.")
        reasoning.append(f"Added sugar ingredients found: {', '.join(added_sugars[:3])}.")

    if refined_flours:
        score -= 12
        concerns.append("Uses refined flour instead of a whole-food carbohydrate source.")

    if additives:
        penalty = min(24, 12 + max(0, len(additives) - 1) * 4)
        score -= penalty
        concerns.append("Contains artificial additives or preservatives.")
        reasoning.append(f"Artificial additives found: {', '.join(additives[:3])}.")

    if gums:
        score -= min(10, 6 + max(0, len(gums) - 1) * 2)
        concerns.append("Includes gums or emulsifiers.")

    if isolates:
        score -= 6
        concerns.append("Uses protein isolates rather than mostly intact foods.")

    if fiber_g >= 5:
        score += 8
        highlights.append("Good fiber per serving.")
    elif fiber_g >= 3:
        score += 5
        highlights.append("Decent fiber per serving.")

    if protein_g >= 15:
        score += 6
        highlights.append("Strong protein per serving.")
    elif protein_g >= 8:
        score += 3
        highlights.append("Moderate protein per serving.")

    if sugar_g > 20:
        score -= 12
        concerns.append("High sugar load per serving.")
    elif sugar_g > 12:
        score -= 6
        concerns.append("Moderate sugar load per serving.")
    elif sugar_g <= 6 and ingredient_count > 0:
        score += 3
        highlights.append("Reasonable sugar level per serving.")

    if sodium_mg > 800:
        score -= 12
        concerns.append("Very high sodium per serving.")
    elif sodium_mg > 500:
        score -= 8
        concerns.append("High sodium per serving.")
    elif sodium_mg > 300:
        score -= 4

    if carbs_g > 0 and fiber_g > 0 and fiber_g / max(carbs_g, 1.0) >= 0.18:
        score += 4
        highlights.append("Carbs come with meaningful fiber.")

    first_ingredient = ingredients[0] if ingredients else ""
    if first_ingredient and any(hint in first_ingredient for hint in WHOLE_FOOD_FIRST_INGREDIENT_HINTS):
        score += 4
        highlights.append("Starts with a recognizable whole-food ingredient.")

    if calories > 0 and protein_g >= 10 and sugar_g <= 8 and not additives and not seed_oils:
        score += 4
        highlights.append("Macros are relatively aligned with a whole-food product.")

    score = max(0.0, min(100.0, round(score, 1)))

    if score >= 85:
        tier = "whole_food"
        verdict = "Great choice"
        summary = "This looks very close to a real-food product with minimal processing."
        action = "This is a strong pantry pick for a whole-food lifestyle."
    elif score >= 70:
        tier = "solid"
        verdict = "Mostly good"
        summary = "This is fairly clean, but there are a few things worth watching."
        action = "Reasonable option. Compare brands if you want an even cleaner label."
    elif score >= 50:
        tier = "mixed"
        verdict = "Mixed bag"
        summary = "This product has some redeeming qualities, but it is noticeably processed."
        action = "Okay occasionally, but not ideal as a staple."
    else:
        tier = "ultra_processed"
        verdict = "Not a great fit"
        summary = "This product is heavily processed and does not align well with a whole-food approach."
        action = "Best used rarely. Look for a version with fewer ingredients and less processing."

    return {
        "score": score,
        "tier": tier,
        "verdict": verdict,
        "summary": summary,
        "recommended_action": action,
        "highlights": highlights[:4],
        "concerns": concerns[:5],
        "reasoning": reasoning[:4],
        "ingredient_count": ingredient_count,
        "nutrition_snapshot": {
            "calories": calories,
            "protein_g": protein_g,
            "fiber_g": fiber_g,
            "sugar_g": sugar_g,
            "carbs_g": carbs_g,
            "sodium_mg": sodium_mg,
        },
        "processing_flags": {
            "seed_oils": seed_oils,
            "added_sugars": added_sugars,
            "refined_flours": refined_flours,
            "artificial_additives": additives,
            "gums_or_emulsifiers": gums,
            "protein_isolates": isolates,
        },
    }
