# ingest telemetrie service

Devices send telemetry over a long-lived socket. Ingest publishes each event to RabbitMQ. The processor stores the event and the current device snapshot in MongoDB. The state service reads that snapshot and the device's events.

- [Architecture](docs/architecture.md)
- [Specs](docs/specs.md)

## Run

```bash
docker compose up --build
```

The state service listens on port 3000. The processor reads the `telemetry` queue. RabbitMQ accepts user `telemetry` with password `telemetry`.

- `GET /health`
- `GET /devices/:deviceId`
- `GET /devices/:deviceId/events`

The ingest service listens on port 4000.

Services log JSON to stdout. `docker compose logs` shows them together.

## Checks

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

The state service test writes one device snapshot and one telemetry event into MongoDB and reads both back through the endpoints.

The emulator test checks that a seed repeats `status` and `temperature`, and that each device sends events on its own socket, including after the socket drops.

## Emulator configuration

```bash
DEVICE_COUNT=2 INTERVAL_MS=1000 INGEST_HOST=127.0.0.1 INGEST_PORT=4000 SEED=1 pnpm --filter @rabbitmq-exercise/emulator start
```

Each device opens its own socket and sends one JSON event per line on `INTERVAL_MS`. Device ids are `device-1` through `device-N`. `SEED` fixes `status` and `temperature`. `eventId` is a new UUID and `sequence` starts at the current time, so a restart does not reuse events. Details are in [docs/emulator.md](docs/emulator.md).

The `emulator` profile waits until ingest is healthy, then connects to host `ingest` on port 4000:

```bash
DEVICE_COUNT=10 docker compose --profile emulator up --build emulator
```

Raise `DEVICE_COUNT` to add devices.

## Multiple instances

TODO

## Limits and compromises

Rebuilding a device snapshot sums that device's events in MongoDB. The work grows with the number of events kept for the device. Reading the latest gauges stays one indexed lookup. The snapshot can lag until that rebuild finishes.

Ingest drops a line that is not a telemetry event and leaves the socket open. A frame over 64 KiB closes the socket.

The emulator sends only `telemetry`: `status`, `temperature`, and an `operations` delta.

## With more time

A running counter in deduplicated buckets, or one transaction around the event insert and the snapshot update, would make each message a constant amount of work.

Further event kinds would extend `type` and keep this envelope: cpu, ram, time powered on, and diagnostic errors.
