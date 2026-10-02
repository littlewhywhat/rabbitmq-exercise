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

## Emulator configuration

TODO

## Multiple instances

TODO

## Limits and compromises

Rebuilding a device snapshot sums that device's events in MongoDB. The work grows with the number of events kept for the device. Reading the latest gauges stays one indexed lookup.

## With more time

A running counter in deduplicated buckets, or one transaction around the event insert and the snapshot update, would make each message a constant amount of work.
