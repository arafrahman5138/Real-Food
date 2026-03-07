from __future__ import annotations

import json
import os
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, text


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
ENV_PATH = BACKEND_DIR / ".env"
OUTPUT_PATH = BACKEND_DIR / "official_meals.json"


def load_database_url() -> str:
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        return db_url

    if not ENV_PATH.exists():
        raise RuntimeError("backend/.env is missing and DATABASE_URL is not set.")

    for raw_line in ENV_PATH.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == "DATABASE_URL":
            return value.strip()

    raise RuntimeError("DATABASE_URL not found in backend/.env.")


def json_safe(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    if isinstance(value, dict):
        return {key: json_safe(val) for key, val in value.items()}
    return value


def export_official_meals() -> int:
    database_url = load_database_url()
    engine = create_engine(database_url)

    query = text(
        """
        SELECT
          id,
          title,
          description,
          ingredients,
          steps,
          prep_time_min,
          cook_time_min,
          total_time_min,
          servings,
          nutrition_info,
          difficulty,
          tags,
          flavor_profile,
          dietary_tags,
          cuisine,
          health_benefits,
          protein_type,
          carb_type,
          is_ai_generated,
          image_url,
          recipe_role,
          is_component,
          meal_group_id,
          default_pairing_ids,
          component_composition,
          is_mes_scoreable,
          needs_default_pairing,
          created_at
        FROM recipes
        ORDER BY lower(title), id
        """
    )

    with engine.connect() as conn:
        rows = [dict(row) for row in conn.execute(query).mappings().all()]

    payload = {
        "source": "live_database",
        "database_url": database_url,
        "exported_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "meal_count": len(rows),
        "meals": [json_safe(row) for row in rows],
    }

    OUTPUT_PATH.write_text(json.dumps(payload, indent=2) + "\n")
    return len(rows)


if __name__ == "__main__":
    count = export_official_meals()
    print(f"Exported {count} meals to {OUTPUT_PATH}")
