#!/usr/bin/env python3
"""
migrate_sqlite_to_pg.py — Copy all data from the SQLite database to PostgreSQL.

Usage:
    1. Make sure PostgreSQL is running (docker compose up -d)
    2. Make sure Alembic migrations are applied (alembic upgrade head)
    3. Run:  python migrate_sqlite_to_pg.py

This reads from the SQLite file and writes into the PostgreSQL database
configured via DATABASE_URL in your .env.
"""
import os
import sys
import sqlite3

from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker

# ─── Configuration ──────────────────────────────────────────
SQLITE_PATH = os.path.join(os.path.dirname(__file__), "wholefoodlabs.db")

# Load PG url from .env or environment
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
PG_URL = os.getenv("DATABASE_URL", "")

if not PG_URL.startswith("postgresql"):
    print("❌ DATABASE_URL in .env must point to PostgreSQL for the target.")
    print(f"   Got: {PG_URL}")
    sys.exit(1)

if not os.path.exists(SQLITE_PATH):
    print(f"❌ SQLite file not found: {SQLITE_PATH}")
    sys.exit(1)

# Tables in dependency order (parents before children)
TABLES = [
    "users",
    "recipes",
    "saved_recipes",
    "meal_plans",
    "meal_plan_items",
    "chat_sessions",
    "nutrition_targets",
    "food_logs",
    "daily_nutrition_summary",
    "local_foods",
    "grocery_lists",
    "achievements",
    "user_achievements",
    "xp_transactions",
    "nutrition_streaks",
    "daily_quests",
]


def migrate():
    # Connect to SQLite
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row

    # Connect to PostgreSQL
    pg_engine = create_engine(PG_URL)
    pg_inspector = inspect(pg_engine)
    pg_tables = pg_inspector.get_table_names()

    Session = sessionmaker(bind=pg_engine)
    pg_session = Session()

    total_rows = 0

    for table in TABLES:
        # Check table exists in both databases
        try:
            rows = sqlite_conn.execute(f"SELECT * FROM {table}").fetchall()
        except sqlite3.OperationalError:
            print(f"  ⏭  {table}: not in SQLite, skipping")
            continue

        if table not in pg_tables:
            print(f"  ⏭  {table}: not in PostgreSQL, skipping (run migrations first)")
            continue

        if not rows:
            print(f"  ·  {table}: empty, skipping")
            continue

        # Get column names from SQLite
        columns = rows[0].keys()

        # Get PG column names and types to handle type coercion
        pg_col_info = {c["name"]: c["type"] for c in pg_inspector.get_columns(table)}
        shared_columns = [c for c in columns if c in pg_col_info]

        if not shared_columns:
            print(f"  ⚠  {table}: no matching columns, skipping")
            continue

        # Detect boolean columns in PG (SQLite stores them as 0/1)
        boolean_cols = set()
        for col_name in shared_columns:
            col_type = str(pg_col_info[col_name])
            if "BOOLEAN" in col_type.upper():
                boolean_cols.add(col_name)

        # Clear existing data in PG table
        pg_session.execute(text(f"DELETE FROM {table}"))

        # Build INSERT statement
        col_list = ", ".join(shared_columns)
        param_list = ", ".join(f":{c}" for c in shared_columns)
        insert_sql = text(f"INSERT INTO {table} ({col_list}) VALUES ({param_list})")

        # Insert rows with type coercion
        batch = []
        for row in rows:
            row_dict = {c: row[c] for c in shared_columns}
            # Convert SQLite integer booleans (0/1) to Python bool
            for bc in boolean_cols:
                if row_dict[bc] is not None:
                    row_dict[bc] = bool(row_dict[bc])
            batch.append(row_dict)

        pg_session.execute(insert_sql, batch)
        total_rows += len(batch)
        print(f"  ✅ {table}: {len(batch)} rows migrated")

    pg_session.commit()
    pg_session.close()
    sqlite_conn.close()

    print(f"\n🎉 Migration complete! {total_rows} total rows copied to PostgreSQL.")


if __name__ == "__main__":
    print("🔄 Migrating SQLite → PostgreSQL...\n")
    migrate()
