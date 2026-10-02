# Emulator

One process runs `DEVICE_COUNT` devices. Each device opens its own TCP connection to ingest and writes one UTF-8 JSON telemetry event plus `\n` every `INTERVAL_MS`.

| Env | Default | Meaning |
|---|---|---|
| `INGEST_HOST` | `127.0.0.1` | Ingest address |
| `INGEST_PORT` | `4000` | Ingest port |
| `DEVICE_COUNT` | `2` | Devices `device-1` … `device-N` |
| `INTERVAL_MS` | `1000` | Send period for every device |
| `SEED` | `1` | Fixes `status` and `temperature` |

Device `i` uses seed `SEED + i - 1`. The same seed repeats `status` and `temperature`. `operations` is `1`. `temperature` is one decimal from 20 to 40. `status` is `up` or `down`.

`eventId` is a UUID. `sequence` starts at `Date.now()` and then climbs by 1. A restart does not reuse an id. A dropped socket is opened again after `INTERVAL_MS`, and the next event uses the next sequence.

Order across devices is not fixed. Order for one device follows `sequence`.

`compose.yaml` starts the emulator only with the `emulator` profile. It connects to host `ingest` on port 4000. Raise `DEVICE_COUNT` to add devices.
