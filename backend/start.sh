#!/bin/bash
set -e

cd "$(dirname "$0")"

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
"$VENV_PYTHON" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
