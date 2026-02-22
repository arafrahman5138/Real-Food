import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from app.db import Base, GUID


class SavedRecipe(Base):
    __tablename__ = "saved_recipes"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False, index=True)
    recipe_id = Column(GUID, ForeignKey("recipes.id"), nullable=False)
    saved_at = Column(DateTime, default=datetime.utcnow)
