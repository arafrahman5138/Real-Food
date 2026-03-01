#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# db_setup.sh — Bootstrap or reset the local PostgreSQL DB
# Usage:  ./db_setup.sh          (first time / normal)
#         ./db_setup.sh --reset  (drop & recreate everything)
# ─────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

# Ensure Docker binary is on PATH (macOS Docker Desktop)
if ! command -v docker &>/dev/null; then
  export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
fi

DB_CONTAINER="realfood-postgres"

# ── 1. Start Docker Compose ────────────────────────────
echo "🐘 Starting PostgreSQL via Docker Compose..."
docker compose -f ../docker-compose.yml up -d

# Wait for DB to accept connections
echo "⏳ Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  docker exec "$DB_CONTAINER" pg_isready -U realfood > /dev/null 2>&1 && break
  sleep 1
done
docker exec "$DB_CONTAINER" pg_isready -U realfood > /dev/null 2>&1 || {
  echo "❌ PostgreSQL did not start in time"; exit 1;
}
echo "✅ PostgreSQL is ready"

# ── 2. Optional reset ──────────────────────────────────
if [[ "${1:-}" == "--reset" ]]; then
  echo "🗑  Resetting database..."
  docker exec "$DB_CONTAINER" psql -U realfood -d wholefoodlabs -c \
    "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  echo "✅ Database reset"
fi

# ── 3. Activate venv & run migrations ──────────────────
if [[ -f "../.venv311/bin/activate" ]]; then
  source "../.venv311/bin/activate"
elif [[ -f "../.venv/bin/activate" ]]; then
  source "../.venv/bin/activate"
fi

echo "📦 Running Alembic migrations..."
PYTHONPATH=. alembic upgrade head

# ── 4. Seed data ───────────────────────────────────────
echo "🌱 Seeding database..."
python seed_db.py 2>/dev/null || echo "  (seed_db.py skipped or not needed)"

echo ""
echo "🎉 Local database is ready!"
echo "   Connection: postgresql://realfood:realfood_local@localhost:5432/wholefoodlabs"
