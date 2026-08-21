#!/usr/bin/env bash
# Dev: sobe backend (8021) + frontend vite (5173), ambos bind 127.0.0.1.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT/backend"
[ -d .venv ] || { uv venv .venv; uv pip install --python .venv/bin/python -r requirements.txt; }
[ -f byc.db ] || .venv/bin/python seed.py --days 10
.venv/bin/python -m uvicorn api_main:app --host 127.0.0.1 --port 8021 &
BACK_PID=$!

cd "$ROOT/frontend"
[ -d node_modules ] || npm install
npm run dev &
FRONT_PID=$!

trap "kill $BACK_PID $FRONT_PID 2>/dev/null" EXIT
echo "backend :8021 | frontend :5173 (Ctrl+C para sair)"
wait
