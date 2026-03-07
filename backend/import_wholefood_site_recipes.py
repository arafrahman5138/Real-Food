#!/usr/bin/env python3
"""
Import recipes from a site and keep only Whole-Food compliant meals.

Usage:
  cd backend
  python3 import_wholefood_site_recipes.py --start-url https://moribyan.com/recipe-index/ --limit 50

What this script does:
- Crawls recipe pages from the provided start URL/domain
- Extracts JSON-LD Recipe blocks (with HTML fallback)
- Applies whole-food screening rules
- Substitutes disallowed ingredients when possible; rejects when not possible
- Adds app-ready classification fields and nutrition/health benefits
- Inserts/updates Recipe rows in DB and writes an audit report
"""

from __future__ import annotations

import argparse
import html
import json
import re
import ssl
import uuid
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse
from urllib.error import URLError
from urllib.request import Request, urlopen

from app.db import SessionLocal, init_db
from app.models.recipe import Recipe, RECIPE_ROLES
from app.nutrition_tags import compute_health_benefits
from app.services.metabolic_engine import (
    classify_meal_context,
    MEAL_CONTEXT_FULL,
    MEAL_CONTEXT_COMPONENT_PROTEIN,
    MEAL_CONTEXT_COMPONENT_CARB,
    MEAL_CONTEXT_COMPONENT_VEG,
    MEAL_CONTEXT_SAUCE,
    MEAL_CONTEXT_DESSERT,
)

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

PROTEIN_OPTIONS = ["chicken", "beef", "lamb", "pork", "salmon", "shrimp", "other_fish", "eggs", "vegetarian"]
CARB_OPTIONS = ["rice", "sweet_potato", "potato", "sourdough_bread", "oats", "quinoa", "tortillas", "noodles", "plantain"]

# Metabolic Energy Score (MES) import gate
MIN_IMPORT_MES = 75.0
DEFAULT_MES_BUDGET = {
    "protein_target_g": 130.0,
    "fiber_floor_g": 30.0,
    "sugar_ceiling_g": 36.0,
    "weight_protein": 0.50,
    "weight_fiber": 0.25,
    "weight_sugar": 0.25,
}


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self.links.append(href)


def fetch_html(url: str, timeout: int = 30) -> str:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", "ignore")
    except URLError as exc:
        message = str(exc).lower()
        if "certificate verify failed" not in message:
            raise
        insecure_ctx = ssl._create_unverified_context()
        with urlopen(req, timeout=timeout, context=insecure_ctx) as resp:
            return resp.read().decode("utf-8", "ignore")


def normalize_url(base: str, href: str) -> str:
    u = urljoin(base, href)
    u = u.split("#", 1)[0].split("?", 1)[0]
    return u if not u.endswith("/") else u


def same_domain(u: str, allowed_domain: str) -> bool:
    try:
        return urlparse(u).netloc.endswith(allowed_domain)
    except Exception:
        return False


def looks_like_post(u: str) -> bool:
    p = urlparse(u).path.lower()
    blocked = [
        "/category/", "/tag/", "/shop/", "/contact/", "/about/", "/privacy", "/wp-", "/feed/", "/author/",
        "/page/", "/search/", "/cdn-cgi/",
    ]
    if any(b in p for b in blocked):
        return False
    segments = [s for s in p.split("/") if s]
    return len(segments) <= 2 and len("".join(segments)) > 5


def extract_links(base_url: str, html: str, allowed_domain: str) -> list[str]:
    parser = LinkParser()
    parser.feed(html)
    out: list[str] = []
    for href in parser.links:
        u = normalize_url(base_url, href)
        if same_domain(u, allowed_domain):
            out.append(u)
    return out


def _find_json_ld_blocks(html: str) -> list[str]:
    pat = re.compile(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', re.I | re.S)
    return [m.strip() for m in pat.findall(html) if m and m.strip()]


def _walk_json(obj: Any):
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from _walk_json(v)
    elif isinstance(obj, list):
        for i in obj:
            yield from _walk_json(i)


def extract_recipe_jsonld(html: str) -> dict[str, Any] | None:
    for block in _find_json_ld_blocks(html):
        try:
            parsed = json.loads(block)
        except Exception:
            continue
        for node in _walk_json(parsed):
            t = node.get("@type")
            if isinstance(t, list):
                is_recipe = any(str(x).lower() == "recipe" for x in t)
            else:
                is_recipe = str(t).lower() == "recipe"
            if is_recipe and node.get("recipeIngredient"):
                return node
    return None


def _strip_tags(s: str) -> str:
    s = re.sub(r"<br\s*/?>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def extract_recipe_fallback(html: str) -> dict[str, Any] | None:
    title = ""
    m_title = re.search(r"<h1[^>]*>(.*?)</h1>", html, flags=re.I | re.S)
    if m_title:
        title = _strip_tags(m_title.group(1))

    if not title:
        m_t = re.search(r"<title>(.*?)</title>", html, flags=re.I | re.S)
        if m_t:
            title = _strip_tags(m_t.group(1)).split("|")[0].strip()

    ingredients = [_strip_tags(li) for li in re.findall(r"<li[^>]*>(.*?)</li>", html, flags=re.I | re.S)]
    ingredients = [x for x in ingredients if x and len(x) > 2]
    if len(ingredients) < 4:
        return None

    return {
        "@type": "Recipe",
        "name": title or "Untitled Recipe",
        "description": "",
        "recipeIngredient": ingredients[:60],
        "recipeInstructions": [],
        "prepTime": None,
        "cookTime": None,
        "totalTime": None,
        "recipeYield": "2",
        "recipeCategory": [],
    }


def parse_iso_minutes(v: str | None) -> int:
    if not v:
        return 0
    h = re.search(r"(\d+)H", v)
    m = re.search(r"(\d+)M", v)
    return (int(h.group(1)) if h else 0) * 60 + (int(m.group(1)) if m else 0)


def parse_yield(v: Any) -> int:
    if isinstance(v, int):
        return max(v, 1)
    s = str(v or "").lower()
    m = re.search(r"(\d+)", s)
    return int(m.group(1)) if m else 2


def parse_instructions(v: Any) -> list[str]:
    out: list[str] = []
    if isinstance(v, str):
        out = [x.strip() for x in re.split(r"\n+|\.\s+", v) if x.strip()]
    elif isinstance(v, list):
        for item in v:
            if isinstance(item, str) and item.strip():
                out.append(item.strip())
            elif isinstance(item, dict):
                txt = item.get("text") or item.get("name")
                if txt and str(txt).strip():
                    out.append(str(txt).strip())
    return out[:20]


BANNED_PATTERNS = {
    r"\b(canola|rapeseed) oil\b": "extra virgin olive oil",
    r"\bsoybean oil\b": "extra virgin olive oil",
    r"\bcorn oil\b": "avocado oil",
    r"\bsunflower oil\b": "extra virgin olive oil",
    r"\bsafflower oil\b": "extra virgin olive oil",
    r"\bgrapeseed oil\b": "avocado oil",
    r"\bvegetable oil\b": "extra virgin olive oil",
    r"\bcottonseed oil\b": "extra virgin olive oil",
    r"\brace bran oil\b": "extra virgin olive oil",
    r"\bgranulated sugar\b": "monk fruit sweetener",
    r"\bwhite sugar\b": "monk fruit sweetener",
    r"\bbrown sugar\b": "coconut sugar",
    r"\bpowdered sugar\b": "monk fruit powdered sweetener",
    r"\bconfectioners sugar\b": "monk fruit powdered sweetener",
    r"\bhigh fructose corn syrup\b": "date syrup",
    r"\bcorn syrup\b": "raw honey",
    r"\b(all-purpose|plain|wheat) flour\b": "cassava flour",
    r"\bflour tortillas\b": "cassava tortillas",
    r"\bsoy sauce\b": "coconut aminos",
    r"\bpanko\b": "gluten-free breadcrumbs",
    r"\bbreadcrumbs\b": "gluten-free breadcrumbs",
    r"\bspaghetti\b": "chickpea spaghetti",
    r"\bpasta\b": "brown rice + quinoa pasta",
    r"\bnoodles\b": "brown rice noodles",
    r"\bburger buns\b": "sourdough burger buns",
    r"\bbun\b": "sourdough bun",
}

HARD_REJECT_PATTERNS = [
    r"\bshortening\b",
    r"\bmargarine\b",
    r"\bartificial sweetener\b",
    r"\bartificial flavor\b",
    r"\bfood coloring\b",
    r"\b(aspartame|sucralose|acesulfame|saccharin)\b",
]

ALLOWED_GLUTEN_EXCEPTIONS = ["sourdough bread", "sourdough bun", "sourdough buns"]


def _clean_ingredient_line(s: str) -> str:
    s = html.unescape(s)
    s = re.sub(r"\s+", " ", s).strip(" -\t\n\r")
    return s.replace("\u00a0", " ")


def apply_policy(ingredients: list[str]) -> tuple[list[str], list[str], list[str], bool]:
    new_ing: list[str] = []
    substitutions: list[str] = []
    reject_reasons: list[str] = []
    changed = False

    for raw in ingredients:
        original = _clean_ingredient_line(raw)
        lower_original = original.lower()

        for pat in HARD_REJECT_PATTERNS:
            if re.search(pat, lower_original):
                reject_reasons.append(f"hard-reject ingredient: {original}")

        replaced = original
        for pat, sub in BANNED_PATTERNS.items():
            if re.search(pat, replaced, flags=re.I):
                replaced = re.sub(pat, sub, replaced, flags=re.I)

        lower_replaced = replaced.lower()
        unresolved_gluten = (
            bool(re.search(r"\b(all-purpose flour|plain flour|wheat flour|semolina|farina|barley|rye)\b", lower_replaced))
            and not any(exc in lower_replaced for exc in ALLOWED_GLUTEN_EXCEPTIONS)
        )
        if unresolved_gluten:
            reject_reasons.append(f"unresolved gluten ingredient: {original}")

        unresolved_seed_oil = any(
            o in lower_replaced
            for o in ["canola oil", "soybean oil", "corn oil", "sunflower oil", "safflower oil", "grapeseed oil", "vegetable oil", "cottonseed oil", "rice bran oil"]
        )
        if unresolved_seed_oil:
            reject_reasons.append(f"unresolved seed oil ingredient: {original}")

        unresolved_refined_sugar = any(
            z in lower_replaced
            for z in ["white sugar", "granulated sugar", "brown sugar", "powdered sugar", "confectioners sugar", "corn syrup", "high fructose corn syrup"]
        )
        if unresolved_refined_sugar:
            reject_reasons.append(f"unresolved refined sugar ingredient: {original}")

        if replaced != original:
            changed = True
            substitutions.append(f"{original} -> {replaced}")

        new_ing.append(replaced)

    return new_ing, substitutions, reject_reasons, changed


def guess_category(name: str) -> str:
    s = name.lower()
    if any(x in s for x in ["chicken", "beef", "lamb", "salmon", "shrimp", "fish", "tofu", "egg", "turkey", "tuna", "chickpea", "lentil"]):
        return "protein"
    if any(x in s for x in ["rice", "potato", "quinoa", "oats", "pasta", "sourdough", "tortilla", "bread", "noodle", "plantain"]):
        return "grains"
    if any(x in s for x in ["oil", "butter", "ghee", "avocado oil", "olive oil"]):
        return "fats"
    if any(x in s for x in ["salt", "pepper", "paprika", "cumin", "garlic powder", "cinnamon", "oregano", "thyme", "spice"]):
        return "spices"
    if any(x in s for x in ["milk", "yogurt", "cheese", "cream"]):
        return "dairy"
    if any(x in s for x in ["syrup", "honey", "monk fruit", "stevia", "agave", "date syrup", "sugar"]):
        return "sweetener"
    return "produce"


def to_ingredient_objs(lines: list[str]) -> list[dict[str, str]]:
    out = []
    for line in lines:
        clean = _clean_ingredient_line(line)
        m = re.match(r"^([\d\/\.\s]+)\s+([a-zA-Z]+)?\s*(.*)$", clean)
        if m and len(m.group(3)) > 1:
            qty = (m.group(1) or "").strip()
            unit = (m.group(2) or "").strip()
            name = (m.group(3) or "").strip(", ")
        else:
            qty = ""
            unit = ""
            name = clean
        out.append({"name": name, "quantity": qty, "unit": unit, "category": guess_category(name)})
    return out


def parse_number(v: Any) -> float | None:
    if v is None:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)", str(v))
    return float(m.group(1)) if m else None


def estimate_micros(ingredients_text: str) -> dict[str, Any]:
    s = ingredients_text.lower()
    micros: dict[str, Any] = {
        "vitamin_a_mcg": 180,
        "vitamin_c_mg": 20,
        "vitamin_d_mcg": 1.2,
        "vitamin_e_mg": 3.0,
        "vitamin_k_mcg": 60,
        "thiamin_mg": 0.3,
        "riboflavin_mg": 0.3,
        "niacin_mg": 4.0,
        "vitamin_b6_mg": 0.5,
        "folate_mcg": 90,
        "vitamin_b12_mcg": 0.8,
        "calcium_mg": 120,
        "iron_mg": 3.0,
        "magnesium_mg": 80,
        "phosphorus_mg": 220,
        "potassium_mg": 450,
        "zinc_mg": 2.0,
        "selenium_mcg": 12,
        "omega3_g": 0.2,
    }

    if any(x in s for x in ["salmon", "sardine", "mackerel", "trout"]):
        micros["omega3_g"] = 1.8
        micros["vitamin_d_mcg"] = 8.0
        micros["vitamin_b12_mcg"] = 3.2
    if any(x in s for x in ["spinach", "kale", "broccoli", "chard"]):
        micros["iron_mg"] += 2.5
        micros["calcium_mg"] += 90
        micros["vitamin_k_mcg"] += 120
        micros["folate_mcg"] += 80
    if any(x in s for x in ["lentil", "chickpea", "bean", "quinoa"]):
        micros["iron_mg"] += 1.5
        micros["magnesium_mg"] += 45
        micros["zinc_mg"] += 1.0
    if any(x in s for x in ["citrus", "lemon", "orange", "bell pepper", "kiwi", "berry"]):
        micros["vitamin_c_mg"] += 35
    if any(x in s for x in ["almond", "sunflower", "avocado", "olive oil"]):
        micros["vitamin_e_mg"] += 2.5

    return micros


def build_nutrition(recipe_node: dict[str, Any], ingredient_lines: list[str]) -> dict[str, Any]:
    n = recipe_node.get("nutrition") or {}
    calories = parse_number(n.get("calories"))
    protein = parse_number(n.get("proteinContent"))
    carbs = parse_number(n.get("carbohydrateContent"))
    fat = parse_number(n.get("fatContent"))
    fiber = parse_number(n.get("fiberContent"))
    sugar = parse_number(n.get("sugarContent"))
    sodium = parse_number(n.get("sodiumContent"))

    if calories is None:
        calories = 460.0
    if protein is None:
        protein = 28.0
    if carbs is None:
        carbs = 36.0
    if fat is None:
        fat = 20.0
    if fiber is None:
        fiber = 6.0

    return {
        "calories": round(calories),
        "protein": round(protein, 1),
        "carbs": round(carbs, 1),
        "fat": round(fat, 1),
        "fiber": round(fiber, 1),
        "sugar": round(sugar, 1) if sugar is not None else 6.0,
        "sodium_mg": round(sodium) if sodium is not None else 520,
        "micronutrients": estimate_micros(" ".join(ingredient_lines)),
    }


def compute_meal_mes(nutrition_info: dict[str, Any], budget: dict[str, float] = DEFAULT_MES_BUDGET) -> dict[str, float]:
    meals_per_day = 3
    protein_target_per_meal = max(1.0, budget["protein_target_g"] / meals_per_day)
    fiber_target_per_meal = max(1.0, budget["fiber_floor_g"] / meals_per_day)
    sugar_ceiling_per_meal = max(1.0, budget["sugar_ceiling_g"] / meals_per_day)

    protein_g = float(nutrition_info.get("protein", 0) or 0)
    fiber_g = float(nutrition_info.get("fiber", 0) or 0)
    sugar_g = float(nutrition_info.get("sugar", 0) or 0)

    protein_score = min(protein_g / protein_target_per_meal, 1.0) * 100
    fiber_score = min(fiber_g / fiber_target_per_meal, 1.0) * 100

    sugar_ratio = sugar_g / sugar_ceiling_per_meal
    sugar_score = max(0.0, 100.0 - max(0.0, (sugar_ratio - 1.0)) * 200.0)

    total = (
        budget["weight_protein"] * protein_score
        + budget["weight_fiber"] * fiber_score
        + budget["weight_sugar"] * sugar_score
    )

    return {
        "protein_score": round(protein_score, 1),
        "fiber_score": round(fiber_score, 1),
        "sugar_score": round(sugar_score, 1),
        "total_score": round(total, 1),
    }


def passes_import_gate(nutrition_info: dict[str, Any]) -> tuple[bool, float]:
    mes = compute_meal_mes(nutrition_info)
    total = float(mes["total_score"])
    return total >= MIN_IMPORT_MES, total


# ──────────────────────────── Role classification ────────────────────

# Maps metabolic_engine context → Recipe model recipe_role
_CONTEXT_TO_ROLE: dict[str, str] = {
    MEAL_CONTEXT_FULL: "full_meal",
    MEAL_CONTEXT_COMPONENT_PROTEIN: "protein_base",
    MEAL_CONTEXT_COMPONENT_CARB: "carb_base",
    MEAL_CONTEXT_COMPONENT_VEG: "veg_side",
    MEAL_CONTEXT_SAUCE: "sauce",
    MEAL_CONTEXT_DESSERT: "dessert",
}

_COMPONENT_ROLES = {"protein_base", "carb_base", "veg_side", "sauce"}

# Roles that should NOT receive standalone MES scoring
_NON_SCOREABLE_ROLES = {"dessert", "sauce", "veg_side"}


def classify_recipe_role(title: str, meal_type: str, nutrition: dict[str, Any]) -> tuple[str, bool, bool]:
    """Return (recipe_role, is_component, is_mes_scoreable) for a recipe.

    Uses the authoritative classify_meal_context() from metabolic_engine
    plus importer-specific overrides.
    """
    context = classify_meal_context(title, meal_type, nutrition)
    role = _CONTEXT_TO_ROLE.get(context, "full_meal")

    # Validate role is in model's enum
    if role not in RECIPE_ROLES:
        role = "full_meal"

    is_component = role in _COMPONENT_ROLES
    is_mes_scoreable = role not in _NON_SCOREABLE_ROLES

    return role, is_component, is_mes_scoreable


# ──────────────────────────── MES Rescue via Side Pairing ────────────

def _combine_nutrition(base: dict[str, Any], side: dict[str, Any]) -> dict[str, Any]:
    """Merge base-meal + side nutrition into a composite for MES scoring."""
    combined: dict[str, Any] = {}
    for key in ("protein", "fiber", "sugar", "carbs", "fat", "calories"):
        combined[key] = float(base.get(key, 0) or 0) + float(side.get(key, 0) or 0)
    return combined


def attempt_mes_rescue(
    nutrition: dict[str, Any],
    db,
    *,
    cuisine: str = "global",
    max_pairings: int = 3,
) -> tuple[bool, float, list[str]]:
    """Try to rescue a failing-MES meal by pairing with side library.

    Returns (rescued, best_combined_mes, top_pairing_ids).
    """
    from seed_side_library import get_side_library_with_nutrition

    sides = get_side_library_with_nutrition(db)
    if not sides:
        return False, 0.0, []

    scored: list[tuple[float, str]] = []

    for side in sides:
        combined = _combine_nutrition(nutrition, side["nutrition_info"])
        mes = compute_meal_mes(combined)
        total = float(mes["total_score"])
        # Boost: prefer sides matching cuisine
        if side.get("cuisine") == cuisine and cuisine != "global":
            total += 1.0  # small tie-breaker
        scored.append((total, side["id"]))

    # Sort by MES descending
    scored.sort(key=lambda x: -x[0])

    best_score = scored[0][0] if scored else 0.0
    rescued = best_score >= MIN_IMPORT_MES
    top_ids = [sid for _, sid in scored[:max_pairings]]

    return rescued, round(best_score, 1), top_ids


# ──────────────────────────── Taxonomy Quality Enforcement ───────────

def enforce_taxonomy(
    recipe_payload: dict[str, Any],
    role: str,
    ingredient_lines: list[str],
    title: str,
) -> list[str]:
    """Validate and fill taxonomy fields. Returns list of warnings."""
    warnings: list[str] = []

    # Only enforce strict taxonomy on scoreable full meals
    if role != "full_meal":
        return warnings

    # protein_type
    if not recipe_payload.get("protein_type"):
        inferred = infer_protein_types(ingredient_lines)
        if inferred:
            recipe_payload["protein_type"] = inferred
            warnings.append(f"protein_type auto-filled: {inferred}")
        else:
            warnings.append(f"WARN: empty protein_type for '{title}'")

    # carb_type
    if not recipe_payload.get("carb_type"):
        inferred = infer_carb_types(ingredient_lines)
        if inferred:
            recipe_payload["carb_type"] = inferred
            warnings.append(f"carb_type auto-filled: {inferred}")
        else:
            warnings.append(f"WARN: empty carb_type for '{title}'")

    # flavor_profile
    if not recipe_payload.get("flavor_profile"):
        warnings.append(f"WARN: empty flavor_profile for '{title}'")

    # tags: must have meal-time + service tag
    tags = recipe_payload.get("tags", [])
    meal_time_tags = {"breakfast", "lunch", "dinner", "snack", "dessert"}
    service_tags = {"quick", "sit-down", "bulk-cook", "meal-prep"}
    if not any(t in meal_time_tags for t in tags):
        warnings.append(f"WARN: no meal-time tag for '{title}'")
    if not any(t in service_tags for t in tags):
        warnings.append(f"WARN: no service tag for '{title}'")

    return warnings


def infer_protein_types(ingredients: list[str]) -> list[str]:
    s = " ".join(ingredients).lower()
    inferred: list[str] = []
    if any(x in s for x in ["chicken"]):
        inferred.append("chicken")
    if any(x in s for x in ["beef", "bison"]):
        inferred.append("beef")
    if "lamb" in s:
        inferred.append("lamb")
    if any(x in s for x in ["pork", "ham", "bacon"]):
        inferred.append("pork")
    if "salmon" in s:
        inferred.append("salmon")
    if any(x in s for x in ["shrimp", "prawn"]):
        inferred.append("shrimp")
    if any(x in s for x in ["cod", "tuna", "mackerel", "sardine", "trout", "fish"]) and "salmon" not in s:
        inferred.append("other_fish")
    if any(x in s for x in ["egg", "eggs"]):
        inferred.append("eggs")
    if not inferred and any(x in s for x in ["tofu", "lentil", "chickpea", "bean", "tempeh"]):
        inferred.append("vegetarian")
    return [x for x in inferred if x in PROTEIN_OPTIONS]


def infer_carb_types(ingredients: list[str]) -> list[str]:
    s = " ".join(ingredients).lower()
    inferred: list[str] = []
    if "rice" in s:
        inferred.append("rice")
    if "sweet potato" in s:
        inferred.append("sweet_potato")
    if "potato" in s and "sweet potato" not in s:
        inferred.append("potato")
    if "sourdough" in s:
        inferred.append("sourdough_bread")
    if "oat" in s:
        inferred.append("oats")
    if "quinoa" in s:
        inferred.append("quinoa")
    if any(x in s for x in ["tortilla", "wrap"]):
        inferred.append("tortillas")
    if any(x in s for x in ["noodle", "spaghetti", "pasta"]):
        inferred.append("noodles")
    if "plantain" in s:
        inferred.append("plantain")
    return [x for x in inferred if x in CARB_OPTIONS]


def infer_flavor_profile(title: str, ingredients: list[str], steps: list[str]) -> list[str]:
    s = (title + " " + " ".join(ingredients) + " " + " ".join(steps)).lower()
    flavors: list[str] = []
    if any(x in s for x in ["chili", "jalapeno", "cayenne", "spicy"]):
        flavors.append("spicy")
    if any(x in s for x in ["sweet", "honey", "maple", "coconut sugar", "date syrup"]):
        flavors.append("sweet")
    if any(x in s for x in ["soy", "mushroom", "umami", "parmesan", "miso"]):
        flavors.append("umami")
    if any(x in s for x in ["lemon", "lime", "vinegar", "tangy"]):
        flavors.append("tangy")
    if any(x in s for x in ["garlic", "onion", "herb", "savory"]):
        flavors.append("savory")
    if not flavors:
        flavors.append("savory")
    return flavors[:3]


def infer_dietary_tags(ingredients: list[str]) -> list[str]:
    s = " ".join(ingredients).lower()
    tags = []
    if not any(x in s for x in ["chicken", "beef", "lamb", "fish", "salmon", "shrimp", "turkey", "egg", "pork"]):
        tags.append("vegetarian")
    if not any(x in s for x in ["milk", "cheese", "yogurt", "cream", "butter"]):
        tags.append("dairy-free")
    if not any(x in s for x in ["flour", "wheat", "semolina", "barley", "rye"]):
        tags.append("gluten-free")
    return tags


def infer_cuisine(url: str, title: str) -> str:
    s = f"{url} {title}".lower()
    checks = {
        "indian": ["indian", "masala", "tikka", "dal"],
        "thai": ["thai", "lemongrass", "pad thai"],
        "korean": ["korean", "kimchi", "gochujang"],
        "mexican": ["mexican", "taco", "salsa", "enchilada"],
        "japanese": ["japanese", "miso", "teriyaki", "ramen"],
        "chinese": ["chinese", "szechuan", "dumpling"],
        "vietnamese": ["vietnamese", "pho", "banh mi"],
        "mediterranean": ["mediterranean", "tzatziki", "hummus"],
        "middle_eastern": ["middle eastern", "shawarma", "tahini"],
        "american": ["burger", "bbq", "american"],
    }
    for cuisine, words in checks.items():
        if any(w in s for w in words):
            return cuisine
    return "global"


def twist_title(original: str) -> str:
    # Keep natural seed-style naming. No gimmick prefixes.
    return html.unescape(original).strip()


def twist_description(original_desc: str, substitutions_count: int) -> str:
    base = (original_desc or "Flavor-forward meal reworked for clean whole-food cooking.").strip()
    base = re.sub(r"\s+", " ", base)
    if substitutions_count > 0:
        return f"{base} Built with smarter whole-food swaps while keeping the original flavor profile."
    return base


def twist_steps(steps: list[str]) -> list[str]:
    out: list[str] = []
    for i, step in enumerate(steps, start=1):
        txt = re.sub(r"\s+", " ", step.strip())
        if txt and not txt.endswith("."):
            txt += "."
        if i == 1:
            out.append(f"Step {i}: Prep first — {txt}")
        elif i == len(steps):
            out.append(f"Step {i}: Finish and serve — {txt}")
        else:
            out.append(f"Step {i}: {txt}")
    return out


def infer_meal_type(recipe_node: dict[str, Any], url: str, title: str = "") -> str:
    cat = " ".join(recipe_node.get("recipeCategory") or []) if isinstance(recipe_node.get("recipeCategory"), list) else str(recipe_node.get("recipeCategory") or "")
    s = (cat + " " + url + " " + title).lower()
    breakfast_words = ["breakfast", "pancake", "oatmeal", "french toast", "egg", "smoothie", "muffin", "granola"]
    lunch_words = ["lunch", "salad", "sandwich", "wrap", "bowl"]
    snack_words = ["appetizer", "side", "dip", "salsa", "snack"]
    dessert_words = ["dessert", "cake", "cookie", "brownie", "ice cream", "pie", "beignet", "scone", "baklava", "pastry", "pastries", "loaf", "fudge", "truffle"]

    if any(w in s for w in breakfast_words):
        return "breakfast"
    if any(w in s for w in dessert_words):
        return "dessert"
    if any(w in s for w in snack_words):
        return "snack"
    if any(w in s for w in lunch_words):
        return "lunch"
    return "dinner"


def infer_service_tag(total_min: int, title: str, steps: list[str]) -> str:
    s = (title + " " + " ".join(steps)).lower()
    if any(w in s for w in ["meal prep", "freezer", "batch", "marinade"]):
        return "bulk-cook"
    if total_min and total_min <= 20:
        return "quick"
    if total_min and total_min >= 50:
        return "sit-down"
    return "quick"


@dataclass
class RecipeResult:
    url: str
    title: str
    accepted: bool
    substitutions: list[str] = field(default_factory=list)
    reject_reasons: list[str] = field(default_factory=list)


def crawl_recipe_urls(start_url: str, allowed_domain: str, max_pages: int = 400) -> list[str]:
    queue = [start_url]
    seen: set[str] = set()
    recipe_urls: set[str] = set()

    while queue and len(seen) < max_pages:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)

        try:
            page_html = fetch_html(url)
        except Exception:
            continue

        recipe_node = extract_recipe_jsonld(page_html)
        has_recipe = bool(
            (recipe_node and recipe_node.get("recipeIngredient"))
            or ("recipe-card-details" in page_html and "recipe-ingredient" in page_html and "recipe-instruction" in page_html)
        )

        if has_recipe and looks_like_post(url):
            recipe_urls.add(url)

        for nxt in extract_links(url, page_html, allowed_domain):
            if nxt not in seen:
                queue.append(nxt)

    if not recipe_urls and looks_like_post(start_url) and same_domain(start_url, allowed_domain):
        recipe_urls.add(start_url)

    return sorted(recipe_urls)


def import_recipes(start_url: str, allowed_domain: str, limit: int = 25, max_pages: int = 400) -> tuple[list[RecipeResult], int, int]:
    init_db()
    db = SessionLocal()

    results: list[RecipeResult] = []
    inserted = 0
    updated = 0

    urls = crawl_recipe_urls(start_url=start_url, allowed_domain=allowed_domain, max_pages=max_pages)

    for url in urls:
        if inserted >= limit:
            break

        try:
            page_html = fetch_html(url)
            node = extract_recipe_jsonld(page_html) or extract_recipe_fallback(page_html)
            if not node:
                results.append(RecipeResult(url=url, title=url, accepted=False, reject_reasons=["no recipe data found"]))
                continue

            source_title = html.unescape(str(node.get("name") or "Untitled Recipe")).strip()
            source_desc = html.unescape(str(node.get("description") or "")).strip()
            ingredient_lines = [_clean_ingredient_line(x) for x in (node.get("recipeIngredient") or []) if str(x).strip()]

            if not ingredient_lines:
                results.append(RecipeResult(url=url, title=source_title, accepted=False, reject_reasons=["no ingredients found"]))
                continue

            updated_ingredients, substitutions, reject_reasons, _ = apply_policy(ingredient_lines)
            if reject_reasons:
                results.append(RecipeResult(url=url, title=source_title, accepted=False, substitutions=substitutions, reject_reasons=sorted(set(reject_reasons))))
                continue

            steps = parse_instructions(node.get("recipeInstructions"))
            if not steps:
                # allow import with generated minimal steps if instructions missing
                steps = ["Gather ingredients.", "Cook using medium heat until done.", "Serve and enjoy."]

            prep = parse_iso_minutes(node.get("prepTime"))
            cook = parse_iso_minutes(node.get("cookTime"))
            total = parse_iso_minutes(node.get("totalTime")) or (prep + cook)
            servings = parse_yield(node.get("recipeYield"))

            title = twist_title(source_title)
            description = twist_description(source_desc, len(substitutions))
            ingredients_obj = to_ingredient_objs(updated_ingredients)
            steps_twisted = twist_steps(steps)
            meal_type = infer_meal_type(node, url, source_title)
            service_tag = infer_service_tag(total, source_title, steps_twisted)
            dietary_tags = infer_dietary_tags(updated_ingredients)
            nutrition = build_nutrition(node, updated_ingredients)

            # ── Role classification ──────────────────────────────────
            role, is_component, is_mes_scoreable = classify_recipe_role(
                title, meal_type, nutrition
            )

            # ── MES gate (only for scoreable full meals) ─────────────
            default_pairing_ids: list[str] = []
            mes_score = 0.0

            if is_mes_scoreable and role == "full_meal":
                passes_gate, mes_score = passes_import_gate(nutrition)
                if not passes_gate:
                    # Attempt MES rescue via side pairing
                    cuisine_hint = infer_cuisine(url, source_title)
                    rescued, rescue_score, pairing_ids = attempt_mes_rescue(
                        nutrition, db, cuisine=cuisine_hint
                    )
                    if rescued:
                        default_pairing_ids = pairing_ids
                        mes_score = rescue_score
                    else:
                        results.append(
                            RecipeResult(
                                url=url,
                                title=source_title,
                                accepted=False,
                                substitutions=substitutions,
                                reject_reasons=[
                                    f"MES gate failed: {mes_score} < {MIN_IMPORT_MES} (rescue best: {rescue_score})"
                                ],
                            )
                        )
                        continue
            elif is_mes_scoreable:
                # Scoreable component — compute but don't gate
                _, mes_score = passes_import_gate(nutrition)
            # Non-scoreable (desserts, sauces, sides) skip MES gate entirely

            benefits = compute_health_benefits(ingredients_obj)
            protein_type = infer_protein_types(updated_ingredients)
            carb_type = infer_carb_types(updated_ingredients)
            flavor_profile = infer_flavor_profile(title, updated_ingredients, steps_twisted)
            cuisine = infer_cuisine(url, source_title)
            source_slug = urlparse(start_url).netloc.replace("www.", "").replace(".", "_")

            recipe_payload = {
                "title": title,
                "description": description,
                "ingredients": ingredients_obj,
                "steps": steps_twisted,
                "prep_time_min": prep,
                "cook_time_min": cook,
                "total_time_min": total,
                "servings": servings,
                "nutrition_info": nutrition,
                "difficulty": "easy" if total <= 30 else ("medium" if total <= 60 else "hard"),
                "tags": [meal_type, service_tag, f"{source_slug}_import", "whole-food"],
                "flavor_profile": flavor_profile,
                "dietary_tags": dietary_tags,
                "cuisine": cuisine,
                "health_benefits": benefits,
                "protein_type": protein_type,
                "carb_type": carb_type,
                "is_ai_generated": False,
                "image_url": (node.get("image")[0] if isinstance(node.get("image"), list) and node.get("image") else (node.get("image") if isinstance(node.get("image"), str) else None)),
                # ── Composition fields (Phase C) ──
                "recipe_role": role,
                "is_component": is_component,
                "is_mes_scoreable": is_mes_scoreable,
                "default_pairing_ids": default_pairing_ids,
                "needs_default_pairing": node.get("needs_default_pairing"),
            }

            # ── Taxonomy quality enforcement ─────────────────────────
            tax_warnings = enforce_taxonomy(recipe_payload, role, updated_ingredients, title)
            for w in tax_warnings:
                print(f"  [taxonomy] {w}")

            existing = db.query(Recipe).filter(Recipe.title == title).first()
            if existing:
                for k, v in recipe_payload.items():
                    setattr(existing, k, v)
                updated += 1
            else:
                db.add(Recipe(id=str(uuid.uuid4()), **recipe_payload))
                inserted += 1

            results.append(RecipeResult(url=url, title=source_title, accepted=True, substitutions=substitutions))

        except Exception as exc:
            results.append(RecipeResult(url=url, title=url, accepted=False, reject_reasons=[f"exception: {exc}"]))

    db.commit()
    db.close()

    return results, inserted, updated


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-url", required=True, help="Site URL to start crawl from (e.g., recipe index page)")
    parser.add_argument("--domain", default=None, help="Allowed domain override (default: derived from start-url)")
    parser.add_argument("--limit", type=int, default=25, help="Max accepted recipes to insert")
    parser.add_argument("--max-pages", type=int, default=400, help="Max pages to crawl")
    parser.add_argument("--report", type=str, default="wholefood_site_import_report.json", help="Report JSON path")
    args = parser.parse_args()

    parsed = urlparse(args.start_url)
    allowed_domain = args.domain or parsed.netloc.replace("www.", "")

    results, inserted, updated = import_recipes(
        start_url=args.start_url,
        allowed_domain=allowed_domain,
        limit=args.limit,
        max_pages=args.max_pages,
    )

    accepted = [r for r in results if r.accepted]
    rejected = [r for r in results if not r.accepted]

    report = {
        "start_url": args.start_url,
        "allowed_domain": allowed_domain,
        "attempted": len(results),
        "accepted": len(accepted),
        "inserted": inserted,
        "updated": updated,
        "rejected": len(rejected),
        "accepted_items": [{"title": r.title, "url": r.url, "substitutions": r.substitutions} for r in accepted],
        "rejected_items": [{"title": r.title, "url": r.url, "reasons": r.reject_reasons, "substitutions": r.substitutions} for r in rejected],
    }

    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(json.dumps({
        "inserted": inserted,
        "updated": updated,
        "accepted": len(accepted),
        "rejected": len(rejected),
        "report": args.report,
    }, indent=2))


if __name__ == "__main__":
    main()
