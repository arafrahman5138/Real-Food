from fastapi import APIRouter, Depends, Query
import httpx
from sqlalchemy.orm import Session
from app.db import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.local_food import LocalFood
from app.config import get_settings

router = APIRouter()
settings = get_settings()


@router.get("/search")
async def search_foods(
    q: str = Query(..., description="Search query"),
    page: int = Query(1, ge=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    local_hits = (
        db.query(LocalFood)
        .filter(LocalFood.name.ilike(f"%{q}%"))
        .limit(20)
        .all()
    )
    local_foods = [
        {
            "id": f"local-{f.id}",
            "name": f.name,
            "category": f.category,
            "brand": "Local",
            "nutrients": f.nutrition_info or {},
            "source": "local",
        }
        for f in local_hits
    ]

    if not settings.usda_api_key:
        if local_foods:
            return {"foods": local_foods, "total": len(local_foods), "page": page}
        return {
            "foods": [
                {
                    "id": "sample-1",
                    "name": q.title(),
                    "category": "Whole Foods",
                    "nutrients": {"calories": 100, "protein": 5, "fiber": 3},
                    "description": f"Search results for '{q}' - configure USDA API key for real data",
                }
            ],
            "total": 1,
            "page": page,
        }

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.nal.usda.gov/fdc/v1/foods/search",
            params={
                "api_key": settings.usda_api_key,
                "query": q,
                "pageNumber": page,
                "pageSize": 20,
            },
        )
        data = response.json()

    foods = []
    for food in data.get("foods", []):
        nutrients = {}
        for n in food.get("foodNutrients", []):
            name = n.get("nutrientName", "")
            if "Energy" in name:
                nutrients["calories"] = n.get("value", 0)
            elif "Protein" in name:
                nutrients["protein"] = n.get("value", 0)
            elif "Fiber" in name:
                nutrients["fiber"] = n.get("value", 0)
            elif "Total lipid" in name:
                nutrients["fat"] = n.get("value", 0)
            elif "Carbohydrate" in name:
                nutrients["carbs"] = n.get("value", 0)

        foods.append({
            "id": str(food.get("fdcId", "")),
            "name": food.get("description", ""),
            "category": food.get("foodCategory", ""),
            "brand": food.get("brandOwner", ""),
            "nutrients": nutrients,
        })

    merged = local_foods + foods
    return {"foods": merged, "total": len(merged), "page": page}


@router.get("/{food_id}")
async def get_food_detail(
    food_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if food_id.startswith("local-"):
        local_id = food_id.replace("local-", "", 1)
        item = db.query(LocalFood).filter(LocalFood.id == local_id).first()
        if not item:
            return {"id": food_id, "name": "Unknown Local Food", "nutrients": {}}
        return {
            "id": food_id,
            "name": item.name,
            "category": item.category,
            "nutrients": item.nutrition_info or {},
            "serving": item.serving,
            "source": "local",
        }

    if not settings.usda_api_key:
        return {
            "id": food_id,
            "name": "Sample Food",
            "nutrients": {},
            "description": "Configure USDA API key for real data",
        }

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.nal.usda.gov/fdc/v1/food/{food_id}",
            params={"api_key": settings.usda_api_key},
        )
        data = response.json()

    nutrients = {}
    for n in data.get("foodNutrients", []):
        nutrient = n.get("nutrient", {})
        nutrients[nutrient.get("name", "")] = {
            "value": n.get("amount", 0),
            "unit": nutrient.get("unitName", ""),
        }

    return {
        "id": food_id,
        "name": data.get("description", ""),
        "category": data.get("foodCategory", {}).get("description", ""),
        "nutrients": nutrients,
        "portions": data.get("foodPortions", []),
    }
