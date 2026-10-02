import {
  type TelemetryEvent,
  telemetryEventSchema,
} from '@rabbitmq-exercise/contracts';
import { describe, expect, it } from 'vitest';
import { createDevice } from '../src/device';

const ids = (): (() => string) => {
  let next = 0;
  return () => {
    next += 1;
    return `id-${next}`;
  };
};

const take = (seed: number, count: number): TelemetryEvent[] => {
  const device = createDevice({
    deviceId: 'device-1',
    seed,
    now: () => 1_700_000_000_000,
    nextId: ids(),
  });

  return Array.from({ length: count }, () => device.next());
};

describe('createDevice', () => {
  it('climbs sequence and stays on the telemetry schema', () => {
    const events = take(1, 3);

    expect(events.map((event) => event.sequence)).toEqual([
      1_700_000_000_000, 1_700_000_000_001, 1_700_000_000_002,
    ]);
    for (const event of events) {
      expect(telemetryEventSchema.parse(event)).toEqual(event);
      expect(event.operations).toBe(1);
      expect(event.deviceId).toBe('device-1');
    }
  });

  it('repeats status and temperature for the same seed', () => {
    const first = take(7, 5);
    const second = take(7, 5);

    expect(second).toEqual(first);
  });

  it('changes status or temperature when the seed changes', () => {
    const first = take(1, 5).map((event) => [event.status, event.temperature]);
    const second = take(2, 5).map((event) => [event.status, event.temperature]);

    expect(second).not.toEqual(first);
  });
});
