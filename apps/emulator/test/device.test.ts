import {
  type DeviceEvent,
  deviceEventSchema,
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

const take = (seed: number, count: number): DeviceEvent[] => {
  const device = createDevice({
    deviceId: 'device-1',
    seed,
    now: () => 1_700_000_000_000,
    nextId: ids(),
  });

  return Array.from({ length: count }, () => device.next());
};

describe('createDevice', () => {
  it('climbs sequence and stays on the device event schema', () => {
    const events = take(1, 12);

    expect(events.map((event) => event.sequence)).toEqual(
      Array.from({ length: 12 }, (_, index) => 1_700_000_000_000 + index),
    );
    for (const event of events) {
      expect(deviceEventSchema.parse(event)).toEqual(event);
      expect(event.deviceId).toBe('device-1');
      if (event.type === 'telemetry') {
        expect(event.operations).toBe(1);
      }
    }
    expect(new Set(events.map((event) => event.type)).size).toBeGreaterThan(1);
  });

  it('repeats every kind for the same seed', () => {
    expect(take(7, 8)).toEqual(take(7, 8));
  });

  it('changes the events when the seed changes', () => {
    expect(take(1, 8)).not.toEqual(take(2, 8));
  });
});
