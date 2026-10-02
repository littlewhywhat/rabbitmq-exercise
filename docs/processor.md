# Processor

The processor asserts the durable queues `telemetry-0` through `telemetry-3` and reads one message at a time. `PARTITIONS` selects which of those queues it reads. The default is all four. Each queue has one active consumer, so one device stays with one processor.

A new event is written, then folded into the stored snapshot, then the message is acknowledged. Counters add that event. A gauge moves only when its sequence is newer. An invalid payload is discarded and is not returned to the queue. A failed write is rejected and the message returns to the queue.

A duplicate event id does not change the sum. When the snapshot is missing, or the event was already stored, the snapshot is rebuilt from that device's events. A crash before the acknowledgement is repaired when the message is delivered again.

The stored snapshot includes `eventCount`. A write replaces it only when the new count is higher.
