# Processor

The processor asserts a durable queue named `telemetry` and reads one message at a time.

A valid telemetry event is written, then acknowledged. An invalid payload is discarded and is not returned to the queue. A failed write is rejected and the message returns to the queue.

A crash after the event insert and before the snapshot write is not repaired when that same message is delivered again. The duplicate insert is ignored, so the snapshot stays as it was.
