# ingest telemetrie service

Devices send telemetry over a long-lived socket. Ingest publishes each event to RabbitMQ. The processor stores the event and the current device snapshot in MongoDB. The state service reads that snapshot and the device's events.

- [Architecture](docs/architecture.md)
- [Specs](docs/specs.md)

## Run

```bash
docker compose up --build
```

The state service listens on port 3000.

- `GET /health`
- `GET /devices/:deviceId`
- `GET /devices/:deviceId/events`

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

TODO

## With more time

TODO
