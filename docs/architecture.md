# Architecture

```mermaid
flowchart LR
  emulator[Emulator]
  lb["TCP load balancer"]
  ingest["Socket ingest × N"]
  rabbit[RabbitMQ queue telemetry]
  processor["Processor × N"]
  mongo[(MongoDB)]
  state[State service]

  emulator -->|TCP per device, one JSON event per line| lb
  lb -->|long-lived socket| ingest
  ingest -->|publish| rabbit
  rabbit -->|one message, one processor| processor
  processor -->|event log and device snapshot| mongo
  state -->|read| mongo
```

The emulator opens one long-lived TCP connection per device and writes device events. A TCP load balancer can spread those connections across ingest replicas. Ingest validates each event and publishes it to the `telemetry` queue. Processor replicas read that queue, and one message goes to one processor. The processor is the only writer of events and snapshots: it appends the event and updates that device's snapshot. The state service reads those two MongoDB collections. Both services create the indexes on startup.

MongoDB, RabbitMQ, the state service, ingest, and the processor run in `compose.yaml`. The emulator is in that file under the `emulator` profile. The load balancer is not in that file.
