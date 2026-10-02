# Processor

The processor asserts a durable queue named `telemetry` and reads one message at a time.

A valid device event is written, then that device's snapshot is rebuilt from its events, then the message is acknowledged. MongoDB computes the sums and the newest gauge of each kind. The processor does not load the event log. An invalid payload is discarded and is not returned to the queue. A failed write is rejected and the message returns to the queue.

Rebuilding is safe to repeat. A duplicate event id does not change the sum. A crash before the acknowledgement is repaired when the message is delivered again. The snapshot can lag until that rebuild finishes.

The stored snapshot includes `eventCount`. A rebuild replaces it only when the new count is higher, so two processors cannot overwrite a newer snapshot with an older one.
