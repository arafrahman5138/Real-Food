import asyncio
from copy import deepcopy
from typing import Any, Dict, List

from app.agents.ingredient_swapper import generate_ai_substitutions


DEFAULT_SWAP_MAP = {
    "kale": "spinach",
    "trout": "salmon",
    "cashews": "sunflower seeds",
    "cashew": "sunflower seed",
    "milk": "oat milk",
    "cream": "coconut cream",
    "butter": "olive oil",
}

# Timeouts: strict/direct substitution can wait longer; meal-plan uses shorter budget.
AI_SUBSTITUTION_TIMEOUT_S = 90
MEAL_PLAN_AI_SUBSTITUTION_TIMEOUT_S = 12

ALLERGY_KEYWORDS = {
    "nuts": ["almond", "cashew", "walnut", "pecan", "pistachio", "hazelnut", "nut"],
    "peanuts": ["peanut"],
    "soy": ["soy", "tofu", "tempeh", "edamame"],
    "eggs": ["egg", "mayo", "mayonnaise"],
    "fish": ["fish", "salmon", "trout", "tuna", "cod", "anchovy"],
    "shellfish": ["shrimp", "prawn", "crab", "lobster", "shellfish"],
    "wheat": ["wheat", "flour", "bread", "pasta"],
    "sesame": ["sesame", "tahini"],
}


def _contains_any(text: str, keywords: List[str]) -> bool:
    t = (text or "").lower()
    return any(k in t for k in keywords)


def _deterministic_substitute(
    recipe: Dict[str, Any],
    allergies: List[str],
    disliked_ingredients: List[str],
    liked_proteins: List[str],
    disliked_proteins: List[str],
    custom_excludes: List[str] | None = None,
) -> Dict[str, Any]:
    modified = deepcopy(recipe)
    swaps: List[Dict[str, Any]] = []
    warnings: List[str] = []

    all_excludes = {x.lower() for x in (disliked_ingredients or []) + (custom_excludes or [])}

    allergy_terms: List[str] = []
    for allergy in allergies or []:
        allergy_terms.extend(ALLERGY_KEYWORDS.get((allergy or "").lower(), [(allergy or "").lower()]))

    disliked_protein_set = {p.lower() for p in (disliked_proteins or [])}
    liked_protein_choice = (liked_proteins or [None])[0]

    next_ingredients = []
    for ing in modified.get("ingredients", []) or []:
        name = (ing.get("name") or "").lower()
        original_name = ing.get("name") or ""

        replaced_with = None
        reason = None

        for term in allergy_terms:
            if term and term in name:
                replaced_with = DEFAULT_SWAP_MAP.get(term, DEFAULT_SWAP_MAP.get(original_name.lower(), "ingredient alternative"))
                reason = "allergy-safe substitution"
                break

        if not replaced_with:
            for d in all_excludes:
                if d and d in name:
                    replaced_with = DEFAULT_SWAP_MAP.get(d, "ingredient alternative")
                    reason = "based on your dislikes"
                    break

        if not replaced_with:
            for p in disliked_protein_set:
                if p and p in name:
                    replaced_with = liked_protein_choice or DEFAULT_SWAP_MAP.get(p, "protein alternative")
                    reason = "based on your protein preferences"
                    break

        if replaced_with:
            new_ing = {**ing, "name": replaced_with}
            next_ingredients.append(new_ing)
            swaps.append(
                {
                    "original": original_name,
                    "replacement": replaced_with,
                    "reason": reason,
                    "confidence": 0.72,
                }
            )
        else:
            next_ingredients.append(ing)

    modified["ingredients"] = next_ingredients

    if len(swaps) >= 4:
        warnings.append("Many ingredient substitutions were applied; flavor profile may differ.")

    return {
        "modified_recipe": modified,
        "swaps": swaps,
        "warnings": warnings,
        "used_ai": False,
    }


def deterministic_substitute(
    recipe: Dict[str, Any],
    allergies: List[str],
    disliked_ingredients: List[str],
    liked_proteins: List[str],
    disliked_proteins: List[str],
    custom_excludes: List[str] | None = None,
) -> Dict[str, Any]:
    return _deterministic_substitute(
        recipe=recipe,
        allergies=allergies,
        disliked_ingredients=disliked_ingredients,
        liked_proteins=liked_proteins,
        disliked_proteins=disliked_proteins,
        custom_excludes=custom_excludes,
    )


async def apply_user_substitutions(
    recipe: Dict[str, Any],
    allergies: List[str],
    disliked_ingredients: List[str],
    liked_proteins: List[str],
    disliked_proteins: List[str],
    custom_excludes: List[str] | None = None,
    timeout_s: int = AI_SUBSTITUTION_TIMEOUT_S,
    allow_fallback: bool = True,
) -> Dict[str, Any]:
    try:
        ai_result = await asyncio.wait_for(
            generate_ai_substitutions(
                recipe=recipe,
                allergies=allergies,
                disliked_ingredients=disliked_ingredients,
                liked_proteins=liked_proteins,
                disliked_proteins=disliked_proteins,
                custom_excludes=custom_excludes,
            ),
            timeout=timeout_s,
        )

        if isinstance(ai_result.get("modified_recipe"), dict):
            return ai_result

        raise RuntimeError("LLM substitution returned invalid payload")
    except asyncio.TimeoutError as exc:
        if not allow_fallback:
            raise RuntimeError("LLM substitution timed out") from exc
        fallback = _deterministic_substitute(
            recipe=recipe,
            allergies=allergies,
            disliked_ingredients=disliked_ingredients,
            liked_proteins=liked_proteins,
            disliked_proteins=disliked_proteins,
            custom_excludes=custom_excludes,
        )
        fallback["warnings"] = (fallback.get("warnings") or []) + [
            "AI substitutions timed out; applied fast fallback substitutions.",
        ]
        return fallback
    except Exception as exc:
        if not allow_fallback:
            raise RuntimeError(f"LLM substitution failed: {exc}") from exc
        fallback = _deterministic_substitute(
            recipe=recipe,
            allergies=allergies,
            disliked_ingredients=disliked_ingredients,
            liked_proteins=liked_proteins,
            disliked_proteins=disliked_proteins,
            custom_excludes=custom_excludes,
        )
        fallback["warnings"] = (fallback.get("warnings") or []) + [
            f"AI substitutions unavailable ({exc}); applied fallback substitutions.",
        ]
        return fallback
