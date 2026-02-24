import json
from copy import deepcopy
from typing import Any, Dict, List

from app.agents.llm_provider import get_llm


SYSTEM_PROMPT = """You are a professional chef and nutritionist helping users substitute ingredients.

Goals:
1) Respect hard constraints: allergies and explicit dislikes.
2) Preserve flavor, texture, and cuisine profile as much as possible.
3) Keep the recipe practical and tasty.

Return ONLY valid JSON with this exact shape:
{
  "modified_recipe": {
    "title": "...",
    "description": "...",
    "ingredients": [{"name":"...","quantity":"...","unit":"...","category":"..."}],
    "steps": ["..."],
    "prep_time_min": 0,
    "cook_time_min": 0,
    "servings": 1,
    "difficulty": "easy"
  },
  "swaps": [
    {"original":"...","replacement":"...","reason":"...","confidence":0.0}
  ],
  "warnings": ["..."]
}

If no changes are needed, return the original recipe in modified_recipe and empty swaps.
"""


async def generate_ai_substitutions(
    recipe: Dict[str, Any],
    allergies: List[str],
    disliked_ingredients: List[str],
    liked_proteins: List[str],
    disliked_proteins: List[str],
    custom_excludes: List[str] | None = None,
) -> Dict[str, Any]:
    import logging
    logger = logging.getLogger(__name__)
    
    llm = get_llm()

    payload = {
        "recipe": recipe,
        "constraints": {
            "allergies": allergies,
            "disliked_ingredients": disliked_ingredients,
            "liked_proteins": liked_proteins,
            "disliked_proteins": disliked_proteins,
            "custom_excludes": custom_excludes or [],
        },
    }

    prompt = f"{SYSTEM_PROMPT}\n\nINPUT:\n{json.dumps(payload)}"
    logger.info("ingredient_swapper.llm_call starting recipe=%s constraints=%s", recipe.get('title'), payload['constraints'])
    response = await llm.ainvoke(prompt)
    logger.info("ingredient_swapper.llm_response received chars=%s", len(str(response.content)))

    text = response.content if isinstance(response.content, str) else str(response.content)

    try:
        data = json.loads(text)
    except Exception:
        cleaned = text.strip()
        if "```" in cleaned:
            cleaned = cleaned.replace("```json", "").replace("```", "").strip()
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            cleaned = cleaned[start:end + 1]
        data = json.loads(cleaned)

    return {
        "modified_recipe": data.get("modified_recipe") or deepcopy(recipe),
        "swaps": data.get("swaps") or [],
        "warnings": data.get("warnings") or [],
        "used_ai": True,
    }
