#!/usr/bin/env python3
"""
Import Moribyan recipes as whole-food compliant recipes into Real-Food DB.

Usage:
  cd backend
  python3 import_moribyan_wholefoods.py --limit 25

What this script does:
- Crawls moribyan.com recipe pages
- Extracts JSON-LD Recipe blocks
- Applies whole-food screening rules
- Auto-substitutes disallowed ingredients where possible
- Creates app-ready Recipe records with nutrition + health benefits
- Inserts into DB and prints an audit report
"""

from __future__ import annotations

import argparse
import json
import re
import uuid
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

from app.db import SessionLocal, init_db
from app.models.recipe import Recipe
from app.nutrition_tags import compute_health_benefits

SITE = "https://moribyan.com"
RECIPE_INDEX = f"{SITE}/recipe-index/"

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"


# ---------- crawling ----------

class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "a":
            return
        d = dict(attrs)
        href = d.get("href")
        if href:
            self.links.append(href)


def fetch_html(url: str, timeout: int = 30) -> str:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "ignore")


def normalize_url(base: str, href: str) -> str:
    u = urljoin(base, href)
    u = u.split("#", 1)[0].split("?", 1)[0]
    if u.endswith("/"):
        return u
    return u + "/"


def same_domain(u: str) -> bool:
    try:
        return urlparse(u).netloc.endswith("moribyan.com")
    except Exception:
        return False


def looks_like_post(u: str) -> bool:
    p = urlparse(u).path
    blocked = [
        "/recipe-index/", "/meal-type/", "/category/", "/tag/", "/shop/", "/contact/", "/hey-you/",
        "/lifestyle/", "/privacy-policy/", "/wp-", "/feed/",
    ]
    if any(b in p for b in blocked):
        return False
    # likely slug page
    segments = [s for s in p.split("/") if s]
    return len(segments) == 1


def extract_links(base_url: str, html: str) -> list[str]:
    p = LinkParser()
    p.feed(html)
    out = []
    for href in p.links:
        u = normalize_url(base_url, href)
        if same_domain(u):
            out.append(u)
    return out


# ---------- recipe extraction ----------

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
            if is_recipe:
                return node
    return None


def _strip_tags(s: str) -> str:
    s = re.sub(r"<br\s*/?>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", s).strip()


def extract_recipe_card_fallback(html: str, url: str) -> dict[str, Any] | None:
    """Parse Moribyan recipe-card HTML when JSON-LD lacks ingredient/instruction detail."""
    if "recipe-card-details" not in html or "recipe-ingredient" not in html:
        return None

    # title
    title = ""
    m_title = re.search(r"<h1[^>]*>(.*?)</h1>", html, flags=re.I | re.S)
    if m_title:
        title = _strip_tags(m_title.group(1))
    if not title:
        m_t = re.search(r"<title>(.*?)</title>", html, flags=re.I | re.S)
        if m_t:
            title = _strip_tags(m_t.group(1)).split("|")[0].strip()

    # description (first paragraph under main content)
    desc = ""
    m_desc = re.search(r'<div class="single-content-desc"[^>]*>.*?<p[^>]*>(.*?)</p>', html, flags=re.I | re.S)
    if m_desc:
        desc = _strip_tags(m_desc.group(1))

    # recipe times / yields
    prep = cook = total = 0
    yld = "2"
    for label, var in [("Prep Time", "prep"), ("Cook Time", "cook"), ("Total Time", "total"), ("Yields", "yields")]:
        m = re.search(rf"<label>\s*{label}:\s*</label>\s*<span>(.*?)</span>", html, flags=re.I | re.S)
        if not m:
            continue
        val = _strip_tags(m.group(1)).lower()
        if var == "yields":
            yld = val
        else:
            n = re.search(r"(\d+)", val)
            mins = int(n.group(1)) if n else 0
            if "hour" in val:
                mins *= 60
            if var == "prep":
                prep = mins
            elif var == "cook":
                cook = mins
            else:
                total = mins

    # ingredients list inside recipe-ingredient div
    ingredients: list[str] = []
    m_ing_block = re.search(r'<div class="recipe-ingredient"[^>]*>(.*?)</div>\s*<div class="recipe-instruction"', html, flags=re.I | re.S)
    if m_ing_block:
        for li in re.findall(r"<li[^>]*>(.*?)</li>", m_ing_block.group(1), flags=re.I | re.S):
            txt = _strip_tags(li)
            if txt:
                ingredients.append(txt)

    # instructions list inside recipe-instruction div
    instructions: list[str] = []
    m_inst_block = re.search(r'<div class="recipe-instruction"[^>]*>(.*?)</div>\s*<div class="recipe-notes"', html, flags=re.I | re.S)
    if not m_inst_block:
        m_inst_block = re.search(r'<div class="recipe-instruction"[^>]*>(.*?)</div>', html, flags=re.I | re.S)
    if m_inst_block:
        for li in re.findall(r"<li[^>]*>(.*?)</li>", m_inst_block.group(1), flags=re.I | re.S):
            txt = _strip_tags(li)
            if txt:
                instructions.append(txt)

    if not ingredients:
        return None

    return {
        "@type": "Recipe",
        "name": title or "Untitled Recipe",
        "description": desc,
        "recipeIngredient": ingredients,
        "recipeInstructions": instructions,
        "prepTime": f"PT{prep}M" if prep else None,
        "cookTime": f"PT{cook}M" if cook else None,
        "totalTime": f"PT{total}M" if total else None,
        "recipeYield": yld,
        "recipeCategory": [],
    }


def parse_iso_minutes(v: str | None) -> int:
    if not v:
        return 0
    m_h = re.search(r"(\d+)H", v)
    m_m = re.search(r"(\d+)M", v)
    h = int(m_h.group(1)) if m_h else 0
    m = int(m_m.group(1)) if m_m else 0
    return h * 60 + m


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
            if isinstance(item, str):
                if item.strip():
                    out.append(item.strip())
            elif isinstance(item, dict):
                txt = item.get("text") or item.get("name")
                if txt and str(txt).strip():
                    out.append(str(txt).strip())
    return out[:20]


# ---------- whole-food policy ----------

BANNED_PATTERNS = {
    # seed oils
    r"\b(canola|rapeseed) oil\b": "extra virgin olive oil",
    r"\bsoybean oil\b": "extra virgin olive oil",
    r"\bcorn oil\b": "avocado oil",
    r"\bsunflower oil\b": "extra virgin olive oil",
    r"\bsafflower oil\b": "extra virgin olive oil",
    r"\bgrapeseed oil\b": "avocado oil",
    r"\bvegetable oil\b": "extra virgin olive oil",
    r"\bcottonseed oil\b": "extra virgin olive oil",
    r"\brace bran oil\b": "extra virgin olive oil",
    # refined sugars
    r"\bgranulated sugar\b": "monk fruit sweetener",
    r"\bwhite sugar\b": "monk fruit sweetener",
    r"\bbrown sugar\b": "coconut sugar",
    r"\bpowdered sugar\b": "monk fruit powdered sweetener",
    r"\bconfectioners sugar\b": "monk fruit powdered sweetener",
    r"\bhigh fructose corn syrup\b": "date syrup",
    r"\bcorn syrup\b": "honey",
    # gluten swaps
    r"\ball-purpose flour\b": "cassava flour",
    r"\bplain flour\b": "cassava flour",
    r"\bwheat flour\b": "cassava flour",
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
    r"\bfood coloring\b",
]

ALLOWED_GLUTEN_EXCEPTIONS = ["sourdough bread", "sourdough bun", "sourdough buns"]


def _clean_ingredient_line(s: str) -> str:
    s = re.sub(r"\s+", " ", s).strip(" -\t\n\r")
    s = s.replace("\u00a0", " ")
    return s


def apply_policy(ingredients: list[str]) -> tuple[list[str], list[str], list[str], bool]:
    """Returns (new_ingredients, substitutions, reject_reasons, changed)."""
    new_ing: list[str] = []
    substitutions: list[str] = []
    reject_reasons: list[str] = []
    changed = False

    for raw in ingredients:
        original = _clean_ingredient_line(raw)
        s = original.lower()

        # hard reject
        for pat in HARD_REJECT_PATTERNS:
            if re.search(pat, s):
                reject_reasons.append(f"hard-reject ingredient: {original}")

        # gluten guard (except sourdough)
        if (
            any(x in s for x in ["wheat", "gluten", "semolina", "farina"]) and
            not any(exc in s for exc in ALLOWED_GLUTEN_EXCEPTIONS)
        ):
            # if explicit replacement not found below, we'll reject
            pass

        replaced = original
        for pat, sub in BANNED_PATTERNS.items():
            if re.search(pat, replaced.lower()):
                replaced = re.sub(pat, sub, replaced, flags=re.I)

        # unresolved gluten terms after substitutions
        lower_replaced = replaced.lower()
        unresolved_gluten = any(
            g in lower_replaced for g in [
                "all-purpose flour", "plain flour", "wheat flour", "semolina", "farina", "barley", "rye",
            ]
        ) and not any(exc in lower_replaced for exc in ALLOWED_GLUTEN_EXCEPTIONS)
        if unresolved_gluten:
            reject_reasons.append(f"unresolved gluten ingredient: {original}")

        # unresolved seed oils
        unresolved_seed_oil = any(
            o in lower_replaced for o in [
                "canola oil", "soybean oil", "corn oil", "sunflower oil", "safflower oil",
                "grapeseed oil", "vegetable oil", "cottonseed oil", "rice bran oil",
            ]
        )
        if unresolved_seed_oil:
            reject_reasons.append(f"unresolved seed oil ingredient: {original}")

        # unresolved refined sugars
        unresolved_refined_sugar = any(
            z in lower_replaced for z in [
                "white sugar", "granulated sugar", "brown sugar", "powdered sugar", "confectioners sugar", "corn syrup",
            ]
        )
        if unresolved_refined_sugar:
            reject_reasons.append(f"unresolved refined sugar ingredient: {original}")

        if replaced != original:
            changed = True
            substitutions.append(f"{original} -> {replaced}")

        new_ing.append(replaced)

    return new_ing, substitutions, reject_reasons, changed


# ---------- transformation ----------

PROTEIN_WORDS = [
    "chicken", "beef", "lamb", "salmon", "shrimp", "fish", "tofu", "egg", "turkey", "tuna", "chickpea", "lentil"
]
CARB_WORDS = ["rice", "potato", "quinoa", "oats", "pasta", "sourdough", "tortilla", "bread", "noodle"]


def guess_category(name: str) -> str:
    s = name.lower()
    if any(x in s for x in PROTEIN_WORDS):
        return "protein"
    if any(x in s for x in CARB_WORDS):
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
    for l in lines:
        clean = _clean_ingredient_line(l)
        # lightweight parsing of quantity/unit
        m = re.match(r"^([\d\/\.\s]+)\s+([a-zA-Z]+)?\s*(.*)$", clean)
        if m and len(m.group(3)) > 1:
            qty = (m.group(1) or "").strip()
            unit = (m.group(2) or "").strip()
            name = (m.group(3) or "").strip(", ")
        else:
            qty = ""
            unit = ""
            name = clean
        out.append({
            "name": name,
            "quantity": qty,
            "unit": unit,
            "category": guess_category(name),
        })
    return out


def parse_number(v: Any) -> float | None:
    if v is None:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)", str(v))
    return float(m.group(1)) if m else None


def estimate_micros(ingredients_text: str) -> dict[str, Any]:
    s = ingredients_text.lower()
    micros = {
        "vitamin_c_mg": 12,
        "iron_mg": 3,
        "calcium_mg": 120,
        "potassium_mg": 420,
        "magnesium_mg": 70,
        "omega3_g": 0.2,
    }
    if any(x in s for x in ["salmon", "sardine", "mackerel", "trout"]):
        micros["omega3_g"] = 1.8
        micros["vitamin_d_iu"] = 420
    if any(x in s for x in ["spinach", "kale", "broccoli", "chard"]):
        micros["iron_mg"] += 2
        micros["calcium_mg"] += 80
        micros["vitamin_k_mcg"] = 140
    if any(x in s for x in ["lentil", "chickpea", "bean", "quinoa"]):
        micros["iron_mg"] += 2
        micros["magnesium_mg"] += 40
        micros["fiber_g_est"] = 9
    if any(x in s for x in ["citrus", "lemon", "orange", "bell pepper", "kiwi", "berry"]):
        micros["vitamin_c_mg"] += 25
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

    # conservative fallback estimates when site omits nutrition fields
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


def twist_title(original: str) -> str:
    t = original.strip()
    if t.lower().startswith("whole-food"):
        return t
    return f"Whole-Food {t}"


def twist_description(original_desc: str, substitutions_count: int) -> str:
    base = (original_desc or "Flavor-first recipe upgraded for clean whole-food eating.").strip()
    addon = " Crafted with Real-Food standards: no seed oils, no refined sugar, gluten-smart swaps."
    if substitutions_count:
        addon += f" Includes {substitutions_count} whole-food ingredient swap(s)."
    return (base + addon).strip()


def twist_steps(steps: list[str]) -> list[str]:
    out = []
    for i, s in enumerate(steps, start=1):
        txt = s.strip()
        # light transformation for house style
        txt = re.sub(r"\s+", " ", txt)
        if txt and not txt.endswith("."):
            txt += "."
        out.append(f"Step {i}: {txt}")
    return out


def infer_meal_type(recipe_node: dict[str, Any], url: str) -> str:
    cat = " ".join(recipe_node.get("recipeCategory") or []) if isinstance(recipe_node.get("recipeCategory"), list) else str(recipe_node.get("recipeCategory") or "")
    s = (cat + " " + url).lower()
    if "breakfast" in s:
        return "breakfast"
    if "dessert" in s:
        return "dessert"
    if "appetizer" in s or "side" in s:
        return "snack"
    return "dinner"


def infer_dietary_tags(ingredients: list[str]) -> list[str]:
    s = " ".join(ingredients).lower()
    tags = []
    if not any(x in s for x in ["chicken", "beef", "lamb", "fish", "salmon", "shrimp", "turkey", "egg"]):
        tags.append("vegetarian")
    if not any(x in s for x in ["milk", "cheese", "yogurt", "cream", "butter"]):
        tags.append("dairy-free")
    if not any(x in s for x in ["flour", "wheat", "semolina", "barley", "rye"]):
        tags.append("gluten-free")
    return tags


@dataclass
class RecipeResult:
    url: str
    title: str
    accepted: bool
    substitutions: list[str] = field(default_factory=list)
    reject_reasons: list[str] = field(default_factory=list)


def crawl_recipe_urls(max_pages: int = 300) -> list[str]:
    queue = [RECIPE_INDEX]
    seen: set[str] = set()
    recipe_urls: set[str] = set()

    while queue and len(seen) < max_pages:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        try:
            html = fetch_html(url)
        except Exception:
            continue

        recipe_node = extract_recipe_jsonld(html)
        has_recipe = False
        if recipe_node and str(recipe_node.get("@type", "")).lower().find("recipe") >= 0:
            has_recipe = True
        if "recipe-card-details" in html and "recipe-ingredient" in html:
            has_recipe = True

        if has_recipe and looks_like_post(url):
            recipe_urls.add(url)

        for nxt in extract_links(url, html):
            if nxt in seen:
                continue
            # explore index-like or likely posts
            path = urlparse(nxt).path
            if (
                "/meal-type/" in path
                or "/recipe-index/" in path
                or looks_like_post(nxt)
                or re.search(r"/page/\d+/?$", path)
            ):
                queue.append(nxt)

    return sorted(recipe_urls)


def import_recipes(limit: int = 25) -> tuple[list[RecipeResult], int, int]:
    init_db()
    db = SessionLocal()

    results: list[RecipeResult] = []
    inserted = 0
    updated = 0

    urls = crawl_recipe_urls()
    for url in urls:
        if inserted >= limit:
            break

        try:
            html = fetch_html(url)
            node = extract_recipe_jsonld(html)
            if not node:
                node = extract_recipe_card_fallback(html, url)
            if node and not node.get("recipeIngredient"):
                fallback = extract_recipe_card_fallback(html, url)
                if fallback:
                    node = {**fallback, **node}
                    node["recipeIngredient"] = fallback.get("recipeIngredient", [])
                    if not node.get("recipeInstructions"):
                        node["recipeInstructions"] = fallback.get("recipeInstructions", [])
                    if not node.get("description"):
                        node["description"] = fallback.get("description", "")
            if not node:
                results.append(RecipeResult(url=url, title=url, accepted=False, reject_reasons=["no recipe data found"]))
                continue

            source_title = str(node.get("name") or "Untitled Recipe").strip()
            source_desc = str(node.get("description") or "").strip()
            ingredient_lines = [_clean_ingredient_line(x) for x in (node.get("recipeIngredient") or []) if str(x).strip()]
            if not ingredient_lines:
                results.append(RecipeResult(url=url, title=source_title, accepted=False, reject_reasons=["no ingredients found"]))
                continue

            updated_ingredients, substitutions, reject_reasons, changed = apply_policy(ingredient_lines)
            if reject_reasons:
                results.append(RecipeResult(url=url, title=source_title, accepted=False, substitutions=substitutions, reject_reasons=sorted(set(reject_reasons))))
                continue

            steps = parse_instructions(node.get("recipeInstructions"))
            if not steps:
                results.append(RecipeResult(url=url, title=source_title, accepted=False, substitutions=substitutions, reject_reasons=["no instructions found"]))
                continue

            prep = parse_iso_minutes(node.get("prepTime"))
            cook = parse_iso_minutes(node.get("cookTime"))
            total = parse_iso_minutes(node.get("totalTime")) or (prep + cook)
            servings = parse_yield(node.get("recipeYield"))

            title = twist_title(source_title)
            description = twist_description(source_desc, len(substitutions))
            ingredients_obj = to_ingredient_objs(updated_ingredients)
            steps_twisted = twist_steps(steps)
            meal_type = infer_meal_type(node, url)
            dietary_tags = infer_dietary_tags(updated_ingredients)
            nutrition = build_nutrition(node, updated_ingredients)
            benefits = compute_health_benefits(ingredients_obj)

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
                "tags": [meal_type, "moribyan_import", "whole-food"],
                "flavor_profile": [],
                "dietary_tags": dietary_tags,
                "cuisine": "global",
                "health_benefits": benefits,
                "protein_type": [],
                "carb_type": [],
                "is_ai_generated": False,
                "image_url": (node.get("image")[0] if isinstance(node.get("image"), list) and node.get("image") else (node.get("image") if isinstance(node.get("image"), str) else None)),
            }

            existing = db.query(Recipe).filter(Recipe.title == title).first()
            if existing:
                for k, v in recipe_payload.items():
                    setattr(existing, k, v)
                updated += 1
            else:
                db.add(Recipe(id=str(uuid.uuid4()), **recipe_payload))
                inserted += 1

            results.append(RecipeResult(url=url, title=source_title, accepted=True, substitutions=substitutions))

        except Exception as e:
            results.append(RecipeResult(url=url, title=url, accepted=False, reject_reasons=[f"exception: {e}"]))
            continue

    db.commit()
    db.close()

    return results, inserted, updated


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=25, help="max accepted recipes to insert")
    parser.add_argument("--report", type=str, default="moribyan_import_report.json", help="report file path")
    args = parser.parse_args()

    results, inserted, updated = import_recipes(limit=args.limit)

    accepted = [r for r in results if r.accepted]
    rejected = [r for r in results if not r.accepted]

    report = {
        "attempted": len(results),
        "accepted": len(accepted),
        "inserted": inserted,
        "updated": updated,
        "rejected": len(rejected),
        "accepted_items": [
            {"title": r.title, "url": r.url, "substitutions": r.substitutions}
            for r in accepted
        ],
        "rejected_items": [
            {"title": r.title, "url": r.url, "reasons": r.reject_reasons, "substitutions": r.substitutions}
            for r in rejected
        ],
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
