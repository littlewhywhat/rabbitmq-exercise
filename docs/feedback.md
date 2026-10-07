# Feedback

Notes on this solution after review. None of this is implemented.

## Sequence across a restart

The emulator sets `sequence` to `Date.now()` and then adds 1 for each event. A burst of 1000 events takes the next 1000 integers. If the device stops and starts again 500 ms later, the new `Date.now()` can fall inside that range, so two events share a sequence. An equal sequence keeps the earlier gauge.

One direction is a boot id plus a sequence that starts again on each boot. The processor would have to decide which boot is the latest before it compares sequence. Another scheme could do the same job.

## Before the broker

RabbitMQ redelivers a message until the processor acknowledges it. The socket has no such ack. Ingest can drop a line, or lose it before the broker confirms, and the emulator does not send that event again. A reply on the socket, with a timeout and a resend from the device, would cover that gap.

## One processor per device

A device stays on one queue, and that queue has one active consumer. Two processors cannot apply the same device: the event insert and the snapshot update are not one atomic write. A later scheme could make that snapshot update atomic in the table without a lock.

As it stands, the useful limit is one active processor per device. Raising the partition count and changing the hash spreads devices onto more queues, up to one queue per device.
