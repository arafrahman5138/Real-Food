from pydantic import BaseModel, EmailStr
from typing import Optional


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class SocialAuthRequest(BaseModel):
    provider: str  # "google" or "apple"
    token: str
    name: Optional[str] = None
    email: Optional[EmailStr] = None


class Token(BaseModel):
    access_token: str
    refresh_token: str = ""
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[str] = None


class UserProfile(BaseModel):
    id: str
    email: str
    name: str
    auth_provider: str
    dietary_preferences: list
    flavor_preferences: list
    allergies: list
    liked_ingredients: list
    disliked_ingredients: list
    protein_preferences: dict
    cooking_time_budget: dict
    household_size: int
    budget_level: str
    xp_points: int
    current_streak: int
    longest_streak: int

    class Config:
        from_attributes = True


class UserPreferencesUpdate(BaseModel):
    dietary_preferences: Optional[list] = None
    flavor_preferences: Optional[list] = None
    allergies: Optional[list] = None
    liked_ingredients: Optional[list] = None
    disliked_ingredients: Optional[list] = None
    protein_preferences: Optional[dict] = None
    cooking_time_budget: Optional[dict] = None
    household_size: Optional[int] = None
    budget_level: Optional[str] = None
