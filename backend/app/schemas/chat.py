from pydantic import BaseModel
from typing import Optional, List


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    session_id: str
    message: ChatMessage
    healthified_recipe: Optional[dict] = None
    ingredient_swaps: Optional[List[dict]] = None
    nutrition_comparison: Optional[dict] = None


class ChatSessionSummary(BaseModel):
    id: str
    title: str
    created_at: str
    message_count: int
