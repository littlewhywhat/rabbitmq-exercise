#!/usr/bin/env python3
"""Send telemetry cases at the compose stack and print each result."""

import base64
import json
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

os.chdir(Path(__file__).resolve().parent.parent)


def compose(*args: str) -> str:
    result = subprocess.run(
        ["docker", "compose", "--profile", "emulator", *args],
        check=False,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        raise SystemExit(
            "docker compose " + " ".join(args) + f" failed\n{result.stderr}"
        )
    return result.stdout


def running_processors() -> list[str]:
    output = compose("ps", "--status", "running", "--format", "{{.Name}}", "processor")
    return [line.strip() for line in output.splitlines() if line.strip()]


def ready_processors() -> list[str]:
    ready: list[str] = []
    for name in running_processors():
        logs = subprocess.run(
            ["docker", "logs", name],
            check=False,
            text=True,
            capture_output=True,
        )
        if "consuming telemetry" in logs.stdout + logs.stderr:
            ready.append(name)
    return ready


def wait_until(predicate, timeout: float, message: str) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return
        time.sleep(0.5)
    raise SystemExit(message)


def mongo(script: str) -> None:
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--profile",
            "emulator",
            "exec",
            "-T",
            "mongo",
            "mongosh",
            "--quiet",
            "telemetry",
        ],
        check=False,
        input=script,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        raise SystemExit(f"mongosh failed\n{result.stdout}\n{result.stderr}")


def publish(payload: dict) -> None:
    body = json.dumps(
        {
            "properties": {"content_type": "application/json", "delivery_mode": 2},
            "routing_key": "telemetry",
            "payload": json.dumps(payload, separators=(",", ":")),
            "payload_encoding": "string",
        }
    ).encode()
    request = urllib.request.Request(
        "http://127.0.0.1:15672/api/exchanges/%2F/amq.default/publish",
        data=body,
        method="POST",
        headers={
            "content-type": "application/json",
            "authorization": "Basic "
            + base64.b64encode(b"telemetry:telemetry").decode(),
        },
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        result = json.load(response)
    if not result.get("routed"):
        raise SystemExit(f"rabbitmq did not route the message: {result}")


def send_lines(lines: list[str]) -> None:
    connection = socket.create_connection(("127.0.0.1", 4000), 10)
    try:
        connection.sendall("".join(f"{line}\n" for line in lines).encode())
        connection.shutdown(socket.SHUT_WR)
        time.sleep(0.2)
    finally:
        connection.close()


def send_event(payload: dict) -> None:
    send_lines([json.dumps(payload, separators=(",", ":"))])


def get(path: str):
    try:
        with urllib.request.urlopen("http://127.0.0.1:3000" + path, timeout=5) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, None


def wait_for(path: str, accept, timeout: float = 45):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        status, body = get(path)
        last = (status, body)
        if status == 200 and accept(body):
            return body
        time.sleep(0.5)
    raise SystemExit(f"timed out waiting for {path}: {last}")


def show(label: str, body) -> None:
    print(label, json.dumps(body, sort_keys=True), flush=True)


def scenario(name: str) -> None:
    print(flush=True)
    print(name, flush=True)


def snapshot(device_id: str, **fields):
    body = {
        "deviceId": device_id,
        "lastSequence": 0,
        "status": None,
        "temperature": None,
        "operationCount": 0,
        "cpu": None,
        "ram": None,
        "poweredOn": 0,
        "diagnostic": None,
    }
    body.update(fields)
    return body


def synthetic() -> None:
    scenario("synthetic")
    payload = {
        "type": "telemetry",
        "eventId": "e2e-1",
        "deviceId": "device-e2e",
        "sequence": 1,
        "status": "up",
        "temperature": 21.5,
        "operations": 3,
    }
    send_event(payload)
    show(
        "device-e2e",
        wait_for(
            "/devices/device-e2e",
            lambda body: body
            == snapshot(
                "device-e2e",
                lastSequence=1,
                status="up",
                temperature=21.5,
                operationCount=3,
            ),
        ),
    )
    show(
        "device-e2e events",
        wait_for("/devices/device-e2e/events", lambda body: body == [payload]),
    )


def emulator() -> None:
    scenario("emulator")
    try:
        show(
            "device-1",
            wait_for(
                "/devices/device-1",
                lambda body: body.get("deviceId") == "device-1"
                and isinstance(body.get("lastSequence"), int),
            ),
        )
    finally:
        compose("stop", "emulator")


def duplicate() -> None:
    scenario("duplicate")
    first = {
        "type": "telemetry",
        "eventId": "dup-1",
        "deviceId": "device-dup",
        "sequence": 1,
        "status": "up",
        "temperature": 20,
        "operations": 5,
    }
    second = {
        "type": "telemetry",
        "eventId": "dup-2",
        "deviceId": "device-dup",
        "sequence": 2,
        "status": "down",
        "temperature": 30,
        "operations": 1,
    }
    send_event(first)
    wait_for(
        "/devices/device-dup",
        lambda body: body.get("operationCount") == 5,
    )
    send_lines(
        [
            json.dumps(
                {**first, "status": "down", "temperature": 99, "operations": 9},
                separators=(",", ":"),
            ),
            json.dumps(second, separators=(",", ":")),
        ]
    )
    show(
        "device-dup",
        wait_for(
            "/devices/device-dup",
            lambda body: body
            == snapshot(
                "device-dup",
                lastSequence=2,
                status="down",
                temperature=30,
                operationCount=6,
            ),
        ),
    )
    show(
        "device-dup events",
        wait_for("/devices/device-dup/events", lambda body: body == [first, second]),
    )


def older_sequence() -> None:
    scenario("older sequence")
    newer = {
        "type": "telemetry",
        "eventId": "order-5",
        "deviceId": "device-order",
        "sequence": 5,
        "status": "up",
        "temperature": 50,
        "operations": 1,
    }
    older = {
        "type": "telemetry",
        "eventId": "order-3",
        "deviceId": "device-order",
        "sequence": 3,
        "status": "down",
        "temperature": 10,
        "operations": 2,
    }
    send_event(newer)
    wait_for("/devices/device-order", lambda body: body.get("lastSequence") == 5)
    send_event(older)
    show(
        "device-order",
        wait_for(
            "/devices/device-order",
            lambda body: body
            == snapshot(
                "device-order",
                lastSequence=5,
                status="up",
                temperature=50,
                operationCount=3,
            ),
        ),
    )
    show(
        "device-order events",
        wait_for(
            "/devices/device-order/events",
            lambda body: body == [older, newer],
        ),
    )


def broken_line() -> None:
    scenario("broken line")
    valid = {
        "type": "telemetry",
        "eventId": "bad-1",
        "deviceId": "device-bad",
        "sequence": 1,
        "status": "up",
        "temperature": 18,
        "operations": 2,
    }
    send_lines(["not-json", "{}", json.dumps(valid, separators=(",", ":"))])
    show(
        "device-bad",
        wait_for(
            "/devices/device-bad",
            lambda body: body
            == snapshot(
                "device-bad",
                lastSequence=1,
                status="up",
                temperature=18,
                operationCount=2,
            ),
        ),
    )
    show(
        "device-bad events",
        wait_for("/devices/device-bad/events", lambda body: body == [valid]),
    )


def crash_after_insert() -> None:
    scenario("crash after insert")
    payload = {
        "type": "telemetry",
        "eventId": "crash-1",
        "deviceId": "device-crash",
        "sequence": 7,
        "status": "down",
        "temperature": 12,
        "operations": 4,
    }
    compose("stop", "processor")
    try:
        wait_until(lambda: len(running_processors()) == 0, 30, "processor did not stop")
        mongo(
            "const existing = db.device_states.findOne({deviceId: "
            + json.dumps(payload["deviceId"])
            + "});\n"
            "if (existing) { throw new Error('snapshot already exists'); }\n"
            "db.events.insertOne(" + json.dumps(payload) + ");\n"
        )
        status, _body = get("/devices/device-crash")
        if status != 404:
            raise SystemExit(f"snapshot existed before redelivery: {status}")
        publish(payload)
        compose("start", "processor")
        wait_until(
            lambda: len(ready_processors()) >= 1,
            60,
            "processor did not start consuming",
        )
        show(
            "device-crash",
            wait_for(
                "/devices/device-crash",
                lambda body: body
                == snapshot(
                    "device-crash",
                    lastSequence=7,
                    status="down",
                    temperature=12,
                    operationCount=4,
                ),
                60,
            ),
        )
        show(
            "device-crash events",
            wait_for("/devices/device-crash/events", lambda body: body == [payload]),
        )
    finally:
        subprocess.run(
            ["docker", "compose", "--profile", "emulator", "start", "processor"],
            check=False,
            capture_output=True,
        )


def two_processors() -> None:
    scenario("two processors")
    events = [
        {
            "type": "telemetry",
            "eventId": f"multi-{index}",
            "deviceId": "device-multi",
            "sequence": index,
            "status": "up" if index % 2 == 0 else "down",
            "temperature": index,
            "operations": (index % 3) + 1,
        }
        for index in range(20)
    ]
    compose(
        "up",
        "-d",
        "--no-deps",
        "--no-build",
        "--scale",
        "processor=2",
        "processor",
    )
    wait_until(
        lambda: len(ready_processors()) >= 2,
        90,
        "second processor did not start consuming",
    )
    send_lines([json.dumps(event, separators=(",", ":")) for event in events])
    operation_count = sum(event["operations"] for event in events)
    show(
        "device-multi",
        wait_for(
            "/devices/device-multi",
            lambda body: body
            == snapshot(
                "device-multi",
                lastSequence=19,
                status="down",
                temperature=19,
                operationCount=operation_count,
            ),
            60,
        ),
    )
    show(
        "device-multi events",
        wait_for("/devices/device-multi/events", lambda body: body == events, 60),
    )


def main() -> None:
    synthetic()
    emulator()
    duplicate()
    older_sequence()
    broken_line()
    crash_after_insert()
    two_processors()
    print(flush=True)
    print("e2e ok", flush=True)


if __name__ == "__main__":
    main()
