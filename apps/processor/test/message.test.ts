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

  it('drops invalid json and invalid events', () => {
    expect(parseTelemetryMessage(Buffer.from('not-json'))).toBeNull();
    expect(
      parseTelemetryMessage(Buffer.from('{"type":"telemetry"}')),
    ).toBeNull();
  });
});
