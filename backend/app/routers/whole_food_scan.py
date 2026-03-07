from __future__ import annotations

from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.models.user import User
from app.services.whole_food_scoring import analyze_whole_food_product

router = APIRouter()


class WholeFoodAnalyzeRequest(BaseModel):
    product_name: Optional[str] = None
    brand: Optional[str] = None
    barcode: Optional[str] = None
    ingredients_text: str = ""
    calories: Optional[float] = None
    protein_g: Optional[float] = None
    fiber_g: Optional[float] = None
    sugar_g: Optional[float] = None
    carbs_g: Optional[float] = None
    sodium_mg: Optional[float] = None
    source: str = Field(default="manual")


def _extract_product_payload(product: dict[str, Any], barcode: str) -> dict[str, Any]:
    nutriments = product.get("nutriments", {}) or {}

    def num(*keys: str) -> float | None:
        for key in keys:
            value = nutriments.get(key)
            if value in (None, ""):
                continue
            try:
                return float(value)
            except (TypeError, ValueError):
                continue
        return None

    sodium_mg = num("sodium_serving", "sodium")
    if sodium_mg is not None and sodium_mg < 20:
        sodium_mg = sodium_mg * 1000
    if sodium_mg is None:
        salt_g = num("salt_serving", "salt")
        if salt_g is not None:
            sodium_mg = salt_g * 393.0

    return {
        "product_name": product.get("product_name") or product.get("product_name_en") or "Unknown product",
        "brand": product.get("brands"),
        "barcode": barcode,
        "ingredients_text": product.get("ingredients_text_en") or product.get("ingredients_text") or "",
        "calories": num("energy-kcal_serving", "energy-kcal_100g"),
        "protein_g": num("proteins_serving", "proteins_100g"),
        "fiber_g": num("fiber_serving", "fiber_100g"),
        "sugar_g": num("sugars_serving", "sugars_100g"),
        "carbs_g": num("carbohydrates_serving", "carbohydrates_100g"),
        "sodium_mg": sodium_mg,
        "source": "barcode",
        "image_url": product.get("image_front_small_url") or product.get("image_front_url"),
    }


@router.post("/analyze")
async def analyze_whole_food(
    body: WholeFoodAnalyzeRequest,
    current_user: User = Depends(get_current_user),
):
    del current_user
    result = analyze_whole_food_product(body.model_dump())
    return {
        "product_name": body.product_name or "Label check",
        "brand": body.brand,
        "barcode": body.barcode,
        "source": body.source,
        **result,
    }


@router.get("/barcode/{barcode}")
async def analyze_barcode_product(
    barcode: str,
    current_user: User = Depends(get_current_user),
):
    del current_user
    if not barcode.strip():
        raise HTTPException(status_code=400, detail="Barcode is required.")

    url = f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
    params = {
        "fields": ",".join([
            "product_name",
            "product_name_en",
            "brands",
            "ingredients_text",
            "ingredients_text_en",
            "nutriments",
            "image_front_small_url",
            "image_front_url",
        ])
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Unable to reach barcode product database right now.")

    if data.get("status") != 1 or not data.get("product"):
        raise HTTPException(status_code=404, detail="Product not found for that barcode.")

    payload = _extract_product_payload(data["product"], barcode)
    result = analyze_whole_food_product(payload)
    return {
        "product_name": payload["product_name"],
        "brand": payload.get("brand"),
        "barcode": barcode,
        "image_url": payload.get("image_url"),
        "source": "barcode",
        **result,
    }
