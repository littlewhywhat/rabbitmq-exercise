import type { DeviceState, TelemetryEvent } from '@rabbitmq-exercise/contracts';

export const fold = (
  snapshot: DeviceState | null,
  event: TelemetryEvent,
): DeviceState => {
  if (snapshot === null || event.sequence > snapshot.lastSequence) {
    return {
      deviceId: event.deviceId,
      lastSequence: event.sequence,
      status: event.status,
      temperature: event.temperature,
      operationCount: (snapshot?.operationCount ?? 0) + event.operations,
    };
  }

  return {
    ...snapshot,
    operationCount: snapshot.operationCount + event.operations,
  };
};
