#!/usr/bin/env bash
set -euo pipefail

MODEL="${1:-qwen2.5-coder:14b}"
OLLAMA_HOST="${2:-127.0.0.1:11434}"
SERVE_LOG="/tmp/ollama-serve.log"
MODEL_LOG="/tmp/ollama-$(echo "$MODEL" | tr ':/' '--').log"

if ! command -v ollama >/dev/null 2>&1; then
  echo "ollama not found. Install it from https://ollama.com/docs/installation"
  exit 1
fi

# Start ollama server if not responding
if ! curl -s "http://${OLLAMA_HOST}/" >/dev/null 2>&1; then
  echo "Starting ollama server (logs -> ${SERVE_LOG})..."
  nohup ollama serve --host 127.0.0.1 --port 11434 >"${SERVE_LOG}" 2>&1 &
  sleep 2
fi

# Ensure model is available locally
if ! ollama list | grep -q "$(echo "$MODEL" | cut -d: -f1)"; then
  echo "Model ${MODEL} not found locally. Use 'ollama pull ${MODEL}' to download it, or change OLLAMA_MODEL in .env"
  exit 1
fi

# If model already loaded/running, report and exit
if ollama ps | grep -q "$(echo "$MODEL" | cut -d: -f1)"; then
  echo "Model appears to be running already (see 'ollama ps')."
  exit 0
fi

echo "Starting model ${MODEL} to keep it loaded (logs -> ${MODEL_LOG})..."
# Provide a short initialization prompt to load the model and keep it alive
nohup ollama run "${MODEL}" "Initializing model for background keepalive" --format json --keepalive 1h >"${MODEL_LOG}" 2>&1 &

echo "Started. Ollama server: http://${OLLAMA_HOST}/ ; model: ${MODEL}"
echo "Serve log: ${SERVE_LOG}"
echo "Model log: ${MODEL_LOG}"
