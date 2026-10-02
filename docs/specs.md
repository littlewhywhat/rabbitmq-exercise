# Specs

Every event shares one envelope. `type` selects the kind. A new kind does not change `eventId`, `deviceId`, or `sequence`.

## Envelope

| Field | Type | Rule |
|---|---|---|
| `type` | string | `telemetry`, `cpu`, `ram`, `powered_on`, or `diagnostic` |
| `eventId` | string | Unique per device. A repeat is the same event |
| `deviceId` | string | Device that produced the event |
| `sequence` | integer, ≥ 0 | Device order. Higher means newer for that kind |

## Kinds

| `type` | Fields | Rule |
|---|---|---|
| `telemetry` | `status` `"up"` or `"down"`, `temperature` number, `operations` integer ≥ 0 | Gauges plus a counter delta, usually `1` |
| `cpu` | `cpu` number | Gauge |
| `ram` | `ram` number | Gauge |
| `powered_on` | `poweredOn` integer ≥ 0 | Counter delta, milliseconds powered on |
| `diagnostic` | `code` string, `message` string | Latest error |

## Device snapshot

One document per device.

| Field | Type | Rule |
|---|---|---|
| `deviceId` | string | Identity |
| `lastSequence` | integer, ≥ 0 | Highest sequence of any accepted event |
| `status` | `"up"`, `"down"`, or `null` | Latest telemetry gauge |
| `temperature` | number or `null` | Latest telemetry gauge |
| `operationCount` | integer, ≥ 0 | Sum of telemetry `operations` |
| `cpu` | number or `null` | Latest cpu gauge |
| `ram` | number or `null` | Latest ram gauge |
| `poweredOn` | integer, ≥ 0 | Sum of `poweredOn` |
| `diagnostic` | `{ code, message }` or `null` | Latest diagnostic |

## Collections and indexes

| Collection | Index |
|---|---|
| `device_states` | unique `deviceId` |
| `events` | unique `deviceId` + `eventId` |
| `events` | `deviceId` + `sequence` |

The state service and the processor create these indexes on startup. There is no migration tool. The Zod schemas in `packages/contracts` are the document shapes. The stored snapshot also has `eventCount`, how many events that snapshot includes. The state service does not return it.

`GET /devices/:deviceId/events` returns at most 100 events, the lowest `sequence` values first.

## Processor

The processor is the only component that writes events and snapshots. The state service does not apply events.

- Insert the event. A duplicate `deviceId` + `eventId` is ignored.
- When that device already has a snapshot and the event is new, fold the event into the snapshot. Counters add that event. Each gauge moves only when its own `sequence` is newer. An equal `sequence` keeps the stored gauge. A newer cpu event does not move `temperature`.
- When the snapshot is missing, or the event was already stored, rebuild the snapshot from that device's events.
- Replace the stored snapshot only when the new `eventCount` is higher.

Deleting `device_states` leaves the event log. The next delivery rebuilds that device's snapshot.

## Queue

Four queues are named `telemetry-0` through `telemetry-3`. A publisher sends a device to the queue selected by a hash of `deviceId`. A processor reads the queues listed in `PARTITIONS`, or all four when that variable is unset. Each queue has one active consumer.

## Socket frame

The emulator and ingest share long-lived TCP connections, one per device. Each message is one UTF-8 JSON object terminated by `\n`.

## Extra

- [Emulator](emulator.md)
- [Socket ingest](ingest.md)
- [Processor](processor.md)
