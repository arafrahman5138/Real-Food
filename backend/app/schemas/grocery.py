from pydantic import BaseModel
from typing import Optional, List


class GroceryItem(BaseModel):
    name: str
    quantity: str
    unit: str
    category: str  # produce, protein, dairy, grains, pantry, spices
    checked: bool = False
    estimated_price: Optional[float] = None


class GroceryListResponse(BaseModel):
    id: str
    meal_plan_id: Optional[str] = None
    items: List[GroceryItem]
    price_estimates: dict
    total_estimated_cost: float
    created_at: str

    class Config:
        from_attributes = True


class GroceryListGenerate(BaseModel):
    meal_plan_id: str
