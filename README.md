# ingest telemetrie service

Devices send telemetry over a long-lived socket. Ingest publishes each event to RabbitMQ. The processor stores the event and the current device snapshot in MongoDB. The state service reads that snapshot and the device's events.

- [Architecture](docs/architecture.md)
- [Specs](docs/specs.md)

## Run

```bash
docker compose up --build
```

The state service listens on port 3000. The processor reads the `telemetry-0` upward queues. RabbitMQ accepts user `telemetry` with password `telemetry`.

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

The emulator test checks that a seed repeats each event, and that each device sends events on its own socket, including after the socket drops.

## Emulator configuration

```bash
DEVICE_COUNT=2 INTERVAL_MS=1000 INGEST_HOST=127.0.0.1 INGEST_PORT=4000 SEED=1 pnpm --filter @rabbitmq-exercise/emulator start
```

Each device opens its own socket and sends one JSON event per line on `INTERVAL_MS`. Device ids are `device-1` through `device-N`. `SEED` fixes the kind and the values: `telemetry`, `cpu`, `ram`, `powered_on`, and `diagnostic`. `eventId` is a new UUID and `sequence` starts at the current time, so a restart does not reuse events. Details are in [docs/emulator.md](docs/emulator.md).

The `emulator` profile waits until ingest is healthy, then connects to host `ingest` on port 4000:

```bash
DEVICE_COUNT=10 docker compose --profile emulator up --build emulator
```

Raise `DEVICE_COUNT` to add devices.

## Multiple instances

Ingest replicas publish each device to one of `PARTITION_COUNT` queues, `telemetry-0` upward. The default count is 4, and a device always uses the same queue. A load balancer in front of ingest spreads device connections. This compose file does not run that balancer.

The processor has no host port. Each queue has one active consumer, so a device stays with one processor. Replicas beyond the partition count wait:

```bash
docker compose up --build --scale processor=3
```

## Limits and compromises

A new event is folded into the stored snapshot, so that work stays the same as the device's history grows. A missing snapshot, or an event that was already stored, is still rebuilt from that device's events. The snapshot can lag until that rebuild finishes.

Ingest drops a line that is not a device event and leaves the socket open. A frame over 64 KiB closes the socket.

End-to-end checks start the emulator in one scenario, and that scenario only waits for a device snapshot. The other scenarios write scripted lines to ingest, or insert an event and publish it to the queue.

## With more time

A refactor and deduplication would come next.

Performance stress tests would store many events per device and send a large number of messages.
