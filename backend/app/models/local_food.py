import uuid
from datetime import datetime
from sqlalchemy import Column, String, JSON, DateTime, Integer
from app.db import Base, GUID


class LocalFood(Base):
    __tablename__ = "local_foods"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, unique=True, index=True)
    category = Column(String, default="Whole Foods")
    nutrition_info = Column(JSON, default=dict)  # per serving
    serving = Column(String, default="1 serving")
    tags = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
