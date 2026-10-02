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

| Collection | Index |
|---|---|
| `device_states` | unique `deviceId` |
| `events` | unique `deviceId` + `eventId` |
| `events` | `deviceId` + `sequence` |

The state service and the processor create these indexes on startup. There is no migration tool. The Zod schemas in `packages/contracts` are the document shapes. The stored snapshot also has `eventCount`, how many events that snapshot includes. The state service does not return it.

`GET /devices/:deviceId/events` returns at most 100 events, the lowest `sequence` values first.

## Processor

The processor is the only component that writes. The state service does not apply events.

- Insert the event. A duplicate `deviceId` + `eventId` is ignored.
- After every delivery, rebuild that device's snapshot from its events. `operationCount` is the sum of `operations`. `status` and `temperature` come from the highest `sequence`. An equal `sequence` keeps the earlier event.
- Replace the stored snapshot only when the rebuild includes more events than the one already stored.

Deleting `device_states` leaves the event log. The next delivery rebuilds that device's snapshot.

## Queue

The queue name is `telemetry`. Publishers send to RabbitMQ's default exchange with routing key `telemetry`. Consumers read that queue.

## Socket frame

The emulator and ingest share long-lived TCP connections, one per device. Each message is one UTF-8 JSON object terminated by `\n`.

## Extra

- [Emulator](emulator.md)
- [Socket ingest](ingest.md)
- [Processor](processor.md)
