# Specs

One telemetry event and one device snapshot. Later event kinds extend `type`. They do not change this envelope.

## Telemetry event

| Field | Type | Rule |
|---|---|---|
| `type` | `"telemetry"` | Only kind in this version |
| `eventId` | string | Unique per device. A repeat is the same event |
| `deviceId` | string | Device that produced the event |
| `sequence` | integer, ≥ 0 | Device order. Higher means newer gauges |
| `status` | `"up"` or `"down"` | Gauge |
| `temperature` | number | Gauge |
| `operations` | integer, ≥ 0 | Counter delta, usually `1` |

## Device snapshot

One document per device.

| Field | Type | Rule |
|---|---|---|
| `deviceId` | string | Identity |
| `lastSequence` | integer, ≥ 0 | Highest sequence applied to the gauges |
| `status` | `"up"` or `"down"` | Latest gauge |
| `temperature` | number | Latest gauge |
| `operationCount` | integer, ≥ 0 | Sum of `operations` from accepted events |

## Collections and indexes

| Collection | Unique index |
|---|---|
| `device_states` | `deviceId` |
| `events` | `deviceId` + `eventId` |

The state service creates these indexes on startup. There is no migration tool. The Zod schemas in `packages/contracts` are the document shapes.

## Processor

The processor is the only component that writes. The state service does not apply events.

- Insert the event. A duplicate `deviceId` + `eventId` is ignored, so `operationCount` does not move twice.
- A new event always adds `operations` to `operationCount`.
- `status` and `temperature` change only when `sequence` is greater than `lastSequence`.

Deleting `device_states` leaves the event log. Replaying that log with the same rules rebuilds the snapshots.

## Queue

The queue name is `telemetry`. Publishers send to RabbitMQ's default exchange with routing key `telemetry`. Consumers read that queue.

## Socket frame

The emulator and ingest share a long-lived TCP connection. Each message is one UTF-8 JSON object terminated by `\n`.
