#!/usr/bin/env python3

import json
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

from app.db import SessionLocal
from app.models.recipe import Recipe


def to_jsonable(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def row_to_dict(row):
    data = {}
    for column in row.__table__.columns:
        key = column.name
        data[key] = to_jsonable(getattr(row, key))
    return data


def main():
    session = SessionLocal()
    try:
        recipes = session.query(Recipe).order_by(Recipe.created_at.asc()).all()
        payload = {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "count": len(recipes),
            "meals": [row_to_dict(r) for r in recipes],
        }

        output_path = Path("all_meals_export.json")
        output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

        print(json.dumps({"file": str(output_path), "count": len(recipes)}, indent=2))
    finally:
        session.close()


if __name__ == "__main__":
    main()
