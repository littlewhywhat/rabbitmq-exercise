import { describe, expect, it } from 'vitest';
import { parseTelemetryMessage } from '../src/consume';

const event = {
  type: 'telemetry',
  eventId: 'evt-1',
  deviceId: 'device-1',
  sequence: 1,
  status: 'up',
  temperature: 20,
  operations: 1,
};

describe('parseTelemetryMessage', () => {
  it('returns the event for a valid payload', () => {
    expect(parseTelemetryMessage(Buffer.from(JSON.stringify(event)))).toEqual(
      event,
    );
  });

  it('returns a cpu event', () => {
    const cpu = {
      type: 'cpu',
      eventId: 'cpu-1',
      deviceId: 'device-1',
      sequence: 2,
      cpu: 12.5,
    };

    expect(parseTelemetryMessage(Buffer.from(JSON.stringify(cpu)))).toEqual(
      cpu,
    );
  });

  it('drops invalid json and invalid events', () => {
    expect(parseTelemetryMessage(Buffer.from('not-json'))).toBeNull();
    expect(
      parseTelemetryMessage(Buffer.from('{"type":"telemetry"}')),
    ).toBeNull();
  });
});
