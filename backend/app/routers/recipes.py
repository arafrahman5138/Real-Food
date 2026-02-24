import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.db import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.recipe import Recipe
from app.models.saved_recipe import SavedRecipe
from app.nutrition_tags import HEALTH_BENEFIT_LABELS
from app.achievements_engine import check_achievements
from app.services.ingredient_substitution import apply_user_substitutions
from typing import Optional

router = APIRouter()


def _serialize_recipe_card(r: Recipe) -> dict:
    return {
        "id": str(r.id),
        "title": r.title,
        "description": r.description or "",
        "cuisine": r.cuisine or "american",
        "prep_time_min": r.prep_time_min,
        "cook_time_min": r.cook_time_min,
        "total_time_min": r.total_time_min,
        "difficulty": r.difficulty,
        "tags": r.tags or [],
        "flavor_profile": r.flavor_profile or [],
        "dietary_tags": r.dietary_tags or [],
        "health_benefits": r.health_benefits or [],
        "nutrition_info": r.nutrition_info or {},
        "servings": r.servings,
    }


def _serialize_recipe_full(r: Recipe) -> dict:
    card = _serialize_recipe_card(r)
    card.update({
        "ingredients": r.ingredients or [],
        "steps": r.steps or [],
        "is_ai_generated": r.is_ai_generated,
        "image_url": r.image_url,
    })
    return card


def _json_contains(column_value, search_value: str) -> bool:
    """Check if a JSON list column contains a value (case-insensitive)."""
    if not column_value:
        return False
    items = column_value if isinstance(column_value, list) else []
    return search_value.lower() in [str(v).lower() for v in items]


@router.get("/browse")
async def browse_recipes(
    q: Optional[str] = None,
    cuisine: Optional[str] = None,
    meal_type: Optional[str] = None,
    flavor: Optional[str] = None,
    dietary: Optional[str] = None,
    cook_time: Optional[str] = None,
    difficulty: Optional[str] = None,
    health_benefit: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    all_recipes = db.query(Recipe).all()

    filtered = []
    for r in all_recipes:
        if q and q.lower() not in (r.title or "").lower() and q.lower() not in (r.description or "").lower():
            continue
        if cuisine and (r.cuisine or "").lower() != cuisine.lower():
            continue
        if meal_type and not _json_contains(r.tags, meal_type):
            continue
        if flavor and not _json_contains(r.flavor_profile, flavor):
            continue
        if dietary and not _json_contains(r.dietary_tags, dietary):
            continue
        if health_benefit and not _json_contains(r.health_benefits, health_benefit):
            continue
        if difficulty and (r.difficulty or "").lower() != difficulty.lower():
            continue
        if cook_time:
            total = r.total_time_min or 0
            if cook_time == "quick" and total > 30:
                continue
            elif cook_time == "medium" and (total <= 30 or total > 60):
                continue
            elif cook_time == "long" and total <= 60:
                continue

        filtered.append(r)

    total = len(filtered)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = filtered[start:end]

    return {
        "items": [_serialize_recipe_card(r) for r in page_items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/filters")
async def get_recipe_filters(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    all_recipes = db.query(Recipe).all()

    cuisines: dict[str, int] = {}
    meal_types: dict[str, int] = {}
    flavors: dict[str, int] = {}
    dietary: dict[str, int] = {}
    difficulties: dict[str, int] = {}
    health_benefits: dict[str, int] = {}

    for r in all_recipes:
        c = (r.cuisine or "american").lower()
        cuisines[c] = cuisines.get(c, 0) + 1

        for tag in (r.tags or []):
            if tag:
                meal_types[tag] = meal_types.get(tag, 0) + 1

        for f in (r.flavor_profile or []):
            if f:
                flavors[f] = flavors.get(f, 0) + 1

        for d in (r.dietary_tags or []):
            if d:
                dietary[d] = dietary.get(d, 0) + 1

        diff = (r.difficulty or "easy").lower()
        difficulties[diff] = difficulties.get(diff, 0) + 1

        for hb in (r.health_benefits or []):
            if hb:
                health_benefits[hb] = health_benefits.get(hb, 0) + 1

    def to_list(d: dict) -> list:
        return sorted(
            [{"value": k, "label": HEALTH_BENEFIT_LABELS.get(k, k.replace("_", " ").title()), "count": v} for k, v in d.items()],
            key=lambda x: -x["count"],
        )

    return {
        "cuisines": to_list(cuisines),
        "meal_types": to_list(meal_types),
        "flavors": to_list(flavors),
        "dietary": to_list(dietary),
        "difficulties": to_list(difficulties),
        "health_benefits": to_list(health_benefits),
        "total_recipes": len(all_recipes),
    }


@router.get("/{recipe_id}")
async def get_recipe(
    recipe_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return _serialize_recipe_full(recipe)


@router.get("/")
async def search_recipes(
    q: Optional[str] = None,
    tag: Optional[str] = None,
    difficulty: Optional[str] = None,
    max_time: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Recipe)
    if q:
        query = query.filter(Recipe.title.ilike(f"%{q}%"))
    if difficulty:
        query = query.filter(Recipe.difficulty == difficulty)
    if max_time:
        query = query.filter(Recipe.total_time_min <= max_time)

    recipes = query.limit(20).all()
    return [_serialize_recipe_card(r) for r in recipes]


@router.get("/saved/list")
async def get_saved_recipes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    saved = (
        db.query(SavedRecipe)
        .filter(SavedRecipe.user_id == current_user.id)
        .order_by(SavedRecipe.saved_at.desc())
        .all()
    )
    recipe_ids = [str(s.recipe_id) for s in saved]
    recipes = db.query(Recipe).filter(Recipe.id.in_(recipe_ids)).all() if recipe_ids else []
    recipe_map = {str(r.id): r for r in recipes}
    return {
        "items": [
            _serialize_recipe_card(recipe_map[rid])
            for rid in recipe_ids
            if rid in recipe_map
        ],
        "saved_ids": recipe_ids,
    }


@router.post("/saved/{recipe_id}")
async def save_recipe(
    recipe_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recipe_exists = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe_exists:
        raise HTTPException(status_code=404, detail="Recipe not found")

    existing = (
        db.query(SavedRecipe)
        .filter(SavedRecipe.user_id == current_user.id, SavedRecipe.recipe_id == recipe_id)
        .first()
    )
    if existing:
        return {"status": "already_saved"}

    db.add(SavedRecipe(id=str(uuid.uuid4()), user_id=current_user.id, recipe_id=recipe_id))
    db.commit()

    saved_count = db.query(SavedRecipe).filter(SavedRecipe.user_id == current_user.id).count()
    new_achievements = check_achievements(db, current_user, {"saved_recipe_count": saved_count})

    return {"status": "saved", "achievements": new_achievements}


@router.delete("/saved/{recipe_id}")
async def unsave_recipe(
    recipe_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    saved = (
        db.query(SavedRecipe)
        .filter(SavedRecipe.user_id == current_user.id, SavedRecipe.recipe_id == recipe_id)
        .first()
    )
    if saved:
        db.delete(saved)
        db.commit()
    return {"status": "removed"}


from pydantic import BaseModel as _BM


class CookHelpBody(_BM):
    step_number: int = 0
    question: str = ""


class SubstitutionBody(_BM):
    use_allergies: bool = True
    use_dislikes: bool = True
    custom_excludes: list[str] = []


class SaveGeneratedRecipeBody(_BM):
    title: str
    description: str = ""
    ingredients: list[dict] = []
    steps: list[str] = []
    prep_time_min: int = 0
    cook_time_min: int = 0
    servings: int = 1
    difficulty: str = "easy"
    tags: list[str] = []
    flavor_profile: list[str] = []
    dietary_tags: list[str] = []
    cuisine: str = "american"
    health_benefits: list[str] = []
    nutrition_info: dict = {}


@router.post("/saved")
async def save_generated_recipe(
    body: SaveGeneratedRecipeBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recipe = Recipe(
        id=str(uuid.uuid4()),
        title=body.title.strip() or "Healthified Recipe",
        description=body.description,
        ingredients=body.ingredients or [],
        steps=body.steps or [],
        prep_time_min=body.prep_time_min or 0,
        cook_time_min=body.cook_time_min or 0,
        total_time_min=(body.prep_time_min or 0) + (body.cook_time_min or 0),
        servings=body.servings or 1,
        nutrition_info=body.nutrition_info or {},
        difficulty=body.difficulty or "easy",
        tags=body.tags or ["healthify"],
        flavor_profile=body.flavor_profile or [],
        dietary_tags=body.dietary_tags or [],
        cuisine=body.cuisine or "american",
        health_benefits=body.health_benefits or [],
        is_ai_generated=True,
    )
    db.add(recipe)
    db.flush()

    db.add(SavedRecipe(id=str(uuid.uuid4()), user_id=current_user.id, recipe_id=recipe.id))
    db.commit()

    saved_count = db.query(SavedRecipe).filter(SavedRecipe.user_id == current_user.id).count()
    new_achievements = check_achievements(db, current_user, {"saved_recipe_count": saved_count})

    return {
        "status": "saved",
        "recipe_id": str(recipe.id),
        "achievements": new_achievements,
    }


@router.post("/{recipe_id}/substitute")
async def substitute_recipe_ingredients(
    recipe_id: str,
    body: SubstitutionBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    original_recipe = _serialize_recipe_full(recipe)

    allergies = current_user.allergies if body.use_allergies else []
    disliked_ingredients = current_user.disliked_ingredients if body.use_dislikes else []
    protein_preferences = current_user.protein_preferences or {}

    import logging
    logger = logging.getLogger(__name__)
    logger.info(
        "substitute.start recipe_id=%s user_id=%s allergies=%s dislikes=%s",
        recipe_id, current_user.id, allergies, disliked_ingredients
    )

    try:
        subs_result = await apply_user_substitutions(
            recipe=original_recipe,
            allergies=allergies or [],
            disliked_ingredients=disliked_ingredients or [],
            liked_proteins=protein_preferences.get("liked", []),
            disliked_proteins=protein_preferences.get("disliked", []),
            custom_excludes=body.custom_excludes or [],
            timeout_s=90,
            allow_fallback=False,
        )
        logger.info(
            "substitute.success recipe_id=%s swaps=%s used_ai=%s",
            recipe_id, len(subs_result.get("swaps", [])), subs_result.get("used_ai")
        )
    except Exception as exc:
        logger.exception(
            "substitute.failed recipe_id=%s user_id=%s error=%s",
            recipe_id, current_user.id, exc
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return {
        "original_recipe": original_recipe,
        "modified_recipe": subs_result.get("modified_recipe", original_recipe),
        "swaps": subs_result.get("swaps", []),
        "warnings": subs_result.get("warnings", []),
        "used_ai": subs_result.get("used_ai", False),
    }


@router.post("/{recipe_id}/cook-help")
async def get_cook_help(
    recipe_id: str,
    body: CookHelpBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    recipe_dict = _serialize_recipe_full(recipe)
    try:
        from app.agents.cook_assistant import get_cooking_help
        answer = await get_cooking_help(recipe_dict, body.step_number, body.question)
    except Exception as exc:
        answer = f"I'm having trouble connecting right now. Here's the step: {(recipe.steps or [])[body.step_number] if body.step_number < len(recipe.steps or []) else 'No more steps.'}"

    return {"answer": answer}
