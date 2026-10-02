# Socket ingest

Ingest accepts device events on a long-lived TCP connection and publishes each valid event. It does not write to MongoDB.

Each message is one UTF-8 JSON object terminated by `\n`. The bytes before `\n` are at most 64 KiB. A longer frame closes the connection. An empty line is ignored. Invalid JSON, or an object that does not match a device event, is logged and dropped. The connection stays open.

On startup, ingest asserts four durable queues named `telemetry-0` through `telemetry-3`. A valid event is published to the queue for its `deviceId`, and ingest waits for the broker confirm.

`RABBITMQ_URL` is required. `PORT` defaults to 4000. Logs are JSON on stdout.
