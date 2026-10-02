#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

dump() {
  echo "===== ps ====="
  docker compose --profile emulator ps -a || true
  echo "===== app logs ====="
  docker compose --profile emulator logs --no-color --tail 30 ingest processor emulator || true
}

cleanup() {
  status=$?
  if [[ "$status" -ne 0 ]]; then
    dump
  fi
  docker compose --profile emulator down --volumes --remove-orphans || true
  exit "$status"
}
trap cleanup EXIT

export DEVICE_COUNT=1
export INTERVAL_MS=500
export SEED=1

echo "starting mongo, rabbitmq, ingest, processor, emulator"
docker compose version
docker compose --profile emulator up --build --wait --wait-timeout 300
echo "stack is up"
python3 scripts/e2e.py
