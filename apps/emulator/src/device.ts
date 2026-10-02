import { randomUUID } from 'node:crypto';
import {
  type TelemetryEvent,
  telemetryEventSchema,
} from '@rabbitmq-exercise/contracts';

export type Device = {
  deviceId: string;
  next: () => TelemetryEvent;
};

type CreateDeviceOptions = {
  deviceId: string;
  seed: number;
  now?: () => number;
  nextId?: () => string;
};

const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const createDevice = (options: CreateDeviceOptions): Device => {
  const now = options.now ?? Date.now;
  const nextId = options.nextId ?? randomUUID;
  const random = mulberry32(options.seed);
  let sequence = now();

  return {
    deviceId: options.deviceId,
    next: () => {
      const status = random() < 0.5 ? 'up' : 'down';
      const temperature = Math.round((20 + random() * 20) * 10) / 10;
      const event = telemetryEventSchema.parse({
        type: 'telemetry',
        eventId: nextId(),
        deviceId: options.deviceId,
        sequence,
        status,
        temperature,
        operations: 1,
      });
      sequence += 1;
      return event;
    },
  };
};
