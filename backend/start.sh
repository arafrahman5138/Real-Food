#!/bin/bash
set -e

cd "$(dirname "$0")"

# ── Ensure PostgreSQL is running via Docker ──
DOCKER_BIN="${DOCKER_BIN:-docker}"
if ! command -v "$DOCKER_BIN" &>/dev/null; then
  # Docker Desktop on macOS puts the binary here
  DOCKER_BIN="/Applications/Docker.app/Contents/Resources/bin/docker"
fi

if command -v "$DOCKER_BIN" &>/dev/null; then
  CONTAINER="realfood-postgres"
  if ! "$DOCKER_BIN" ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER}$"; then
    echo "🐘 Starting PostgreSQL container..."
    "$DOCKER_BIN" compose -f ../docker-compose.yml up -d
    # Wait until it's ready
    for i in $(seq 1 15); do
      "$DOCKER_BIN" exec "$CONTAINER" pg_isready -U realfood > /dev/null 2>&1 && break
      sleep 1
    done
    echo "✅ PostgreSQL is ready"
  fi
else
  echo "⚠️  Docker not found — skipping PostgreSQL auto-start (using DATABASE_URL from .env)"
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Prefer the virtualenv Python directly to avoid PATH issues
VENV_PYTHON="venv/bin/python3"
if [ ! -x "$VENV_PYTHON" ]; then
    VENV_PYTHON="python3"
fi

# Install dependencies
echo "Installing dependencies..."
"$VENV_PYTHON" -m pip install -r requirements.txt --quiet

# Create .env from example if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "Edit backend/.env to add your API keys (OPENAI_API_KEY or ANTHROPIC_API_KEY)"
fi

# Start the server
echo ""
echo "Starting WholeFoodLabs API..."
echo "Docs: http://localhost:8000/docs"
echo ""
export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$(pwd)"
"$VENV_PYTHON" -m alembic upgrade head 2>/dev/null || true
"$VENV_PYTHON" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
