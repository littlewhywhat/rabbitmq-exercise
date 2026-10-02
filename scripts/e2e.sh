#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

dump() {
  docker compose --profile emulator logs --no-color || true
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
export BUILDKIT_PROGRESS=plain

docker version
docker compose version
docker compose --profile emulator config >/dev/null
docker compose --profile emulator up --build --wait --wait-timeout 300

python3 - <<'PY'
import json
import socket
import time
import urllib.error
import urllib.request

payload = {
    "type": "telemetry",
    "eventId": "e2e-1",
    "deviceId": "device-e2e",
    "sequence": 1,
    "status": "up",
    "temperature": 21.5,
    "operations": 3,
}

raw = (json.dumps(payload, separators=(",", ":")) + "\n").encode()
sock = socket.create_connection(("127.0.0.1", 4000), 10)
sock.sendall(raw)
sock.close()


def get(path):
    try:
        with urllib.request.urlopen(
            "http://127.0.0.1:3000" + path, timeout=5
        ) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, None


def wait_for(path, accept):
    deadline = time.time() + 45
    last = None
    while time.time() < deadline:
        status, body = get(path)
        last = (status, body)
        if status == 200 and accept(body):
            return body
        time.sleep(1)
    raise SystemExit(f"timed out waiting for {path}: {last}")


snapshot = wait_for(
    "/devices/device-e2e",
    lambda body: body.get("operationCount") == 3,
)
expected = {
    "deviceId": "device-e2e",
    "lastSequence": 1,
    "status": "up",
    "temperature": 21.5,
    "operationCount": 3,
}
if snapshot != expected:
    raise SystemExit(f"snapshot mismatch: {snapshot}")

events = wait_for(
    "/devices/device-e2e/events",
    lambda body: any(event.get("eventId") == "e2e-1" for event in body),
)
if events != [payload]:
    raise SystemExit(f"events mismatch: {events}")

emulator = wait_for(
    "/devices/device-1",
    lambda body: body.get("operationCount", 0) >= 1,
)
print("e2e ok", json.dumps({"snapshot": snapshot, "emulator": emulator}))
PY
