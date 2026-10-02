import type { DeviceState, TelemetryEvent } from '@rabbitmq-exercise/contracts';
import { describe, expect, it } from 'vitest';
import { fold } from '../src/fold';

const event = (overrides: Partial<TelemetryEvent> = {}): TelemetryEvent => ({
  type: 'telemetry',
  eventId: 'evt-1',
  deviceId: 'device-1',
  sequence: 1,
  status: 'up',
  temperature: 20,
  operations: 1,
  ...overrides,
});

const current: DeviceState = {
  deviceId: 'device-1',
  lastSequence: 5,
  status: 'up',
  temperature: 50,
  operationCount: 1,
};

describe('fold', () => {
  it('creates a snapshot from the first event', () => {
    expect(
      fold(null, event({ operations: 2, temperature: 33, status: 'down' })),
    ).toEqual({
      deviceId: 'device-1',
      lastSequence: 1,
      status: 'down',
      temperature: 33,
      operationCount: 2,
    });
  });

  it('moves gauges and adds operations when the sequence is newer', () => {
    expect(
      fold(
        current,
        event({
          eventId: 'evt-2',
          sequence: 6,
          status: 'down',
          temperature: 40,
          operations: 3,
        }),
      ),
    ).toEqual({
      deviceId: 'device-1',
      lastSequence: 6,
      status: 'down',
      temperature: 40,
      operationCount: 4,
    });
  });

  it('keeps gauges and adds operations when the sequence is older or equal', () => {
    expect(
      fold(
        current,
        event({ sequence: 3, status: 'down', temperature: 10, operations: 2 }),
      ),
    ).toEqual({
      deviceId: 'device-1',
      lastSequence: 5,
      status: 'up',
      temperature: 50,
      operationCount: 3,
    });
    expect(
      fold(
        current,
        event({ sequence: 5, status: 'down', temperature: 10, operations: 4 }),
      ),
    ).toEqual({
      deviceId: 'device-1',
      lastSequence: 5,
      status: 'up',
      temperature: 50,
      operationCount: 5,
    });
  });
});
