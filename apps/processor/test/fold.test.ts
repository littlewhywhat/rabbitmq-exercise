import type { DeviceEvent } from '@rabbitmq-exercise/contracts';
import { describe, expect, it } from 'vitest';
import { type FoldSnapshot, fold } from '../src/fold';

const clocks = {
  cpu: null,
  ram: null,
  poweredOn: 0,
  diagnostic: null,
  cpuSequence: null,
  ramSequence: null,
  diagnosticSequence: null,
} as const;

const event = (
  overrides: Partial<Extract<DeviceEvent, { type: 'telemetry' }>> = {},
): Extract<DeviceEvent, { type: 'telemetry' }> => ({
  type: 'telemetry',
  eventId: 'evt-1',
  deviceId: 'device-1',
  sequence: 1,
  status: 'up',
  temperature: 20,
  operations: 1,
  ...overrides,
});

const current: FoldSnapshot = {
  deviceId: 'device-1',
  lastSequence: 5,
  status: 'up',
  temperature: 50,
  operationCount: 1,
  telemetrySequence: 5,
  ...clocks,
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
      telemetrySequence: 1,
      ...clocks,
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
      telemetrySequence: 6,
      ...clocks,
    });
  });

  it('keeps gauges and adds operations when the sequence is older or equal', () => {
    expect(
      fold(
        current,
        event({ sequence: 3, status: 'down', temperature: 10, operations: 2 }),
      ),
    ).toEqual({
      ...current,
      operationCount: 3,
    });
    expect(
      fold(
        current,
        event({ sequence: 5, status: 'down', temperature: 10, operations: 4 }),
      ),
    ).toEqual({
      ...current,
      operationCount: 5,
    });
  });

  it('keeps an older temperature when a newer cpu event sits in between', () => {
    const afterCpu = fold(current, {
      type: 'cpu',
      eventId: 'cpu-10',
      deviceId: 'device-1',
      sequence: 10,
      cpu: 20,
    });
    const afterTelemetry = fold(
      afterCpu,
      event({
        eventId: 'tel-7',
        sequence: 7,
        temperature: 30,
        operations: 2,
      }),
    );

    expect(afterTelemetry).toMatchObject({
      lastSequence: 10,
      status: 'up',
      temperature: 30,
      operationCount: 3,
      cpu: 20,
      telemetrySequence: 7,
      cpuSequence: 10,
    });
  });

  it('sums powered-on time and keeps the newer diagnostic', () => {
    const powered = fold(current, {
      type: 'powered_on',
      eventId: 'on-1',
      deviceId: 'device-1',
      sequence: 2,
      poweredOn: 15,
    });
    const again = fold(powered, {
      type: 'powered_on',
      eventId: 'on-2',
      deviceId: 'device-1',
      sequence: 4,
      poweredOn: 5,
    });
    const latest = fold(again, {
      type: 'diagnostic',
      eventId: 'd-8',
      deviceId: 'device-1',
      sequence: 8,
      code: 'link',
      message: 'uplink interrupted',
    });
    const older = fold(latest, {
      type: 'diagnostic',
      eventId: 'd-6',
      deviceId: 'device-1',
      sequence: 6,
      code: 'sensor',
      message: 'temperature sensor failed',
    });

    expect(older).toMatchObject({
      poweredOn: 20,
      temperature: 50,
      diagnostic: { code: 'link', message: 'uplink interrupted' },
      diagnosticSequence: 8,
    });
  });
});
