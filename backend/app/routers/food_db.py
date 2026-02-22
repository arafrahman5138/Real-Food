from fastapi import APIRouter, Depends, Query
import httpx
from app.auth import get_current_user
from app.models.user import User
from app.config import get_settings

router = APIRouter()
settings = get_settings()


@router.get("/search")
async def search_foods(
    q: str = Query(..., description="Search query"),
    page: int = Query(1, ge=1),
    current_user: User = Depends(get_current_user),
):
    if not settings.usda_api_key:
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

    return {"foods": foods, "total": data.get("totalHits", 0), "page": page}


@router.get("/{food_id}")
async def get_food_detail(
    food_id: str,
    current_user: User = Depends(get_current_user),
):
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
