#!/usr/bin/env bash
# Ingestão diária da curva DI (fonte oficial B3 SPRD) — para a VPS Linux.
# Uso: scripts/ingest_daily.sh  (chamado por timer systemd ou cron)
set -euo pipefail

cd "$(dirname "$0")/../backend"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S%z')] $*"; }

if [ ! -x .venv/bin/python ]; then
  log "criando .venv e instalando dependências"
  if command -v uv >/dev/null 2>&1; then
    uv venv .venv
    uv pip install --python .venv/bin/python -r requirements.txt
  else
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt
  fi
fi

MAX_ATTEMPTS=3
attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  if .venv/bin/python seed.py --days 5 --source official; then
    log "ingestão ok (tentativa $attempt)"
    exit 0
  fi
  log "falha na tentativa $attempt de $MAX_ATTEMPTS"
  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    sleep 60
  fi
  attempt=$((attempt + 1))
done

log "ingestão falhou após $MAX_ATTEMPTS tentativas"
exit 1
