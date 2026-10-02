import { randomUUID } from 'node:crypto';
import {
  type DeviceEvent,
  deviceEventSchema,
} from '@rabbitmq-exercise/contracts';

export type Device = {
  deviceId: string;
  next: () => DeviceEvent;
};

type CreateDeviceOptions = {
  deviceId: string;
  seed: number;
  now?: () => number;
  nextId?: () => string;
};

const KINDS = ['telemetry', 'cpu', 'ram', 'powered_on', 'diagnostic'] as const;

const DIAGNOSTICS = [
  { code: 'sensor', message: 'temperature sensor failed' },
  { code: 'link', message: 'uplink interrupted' },
  { code: 'power', message: 'supply voltage dropped' },
] as const;

const diagnosticOf = (roll: number): (typeof DIAGNOSTICS)[number] => {
  const item = DIAGNOSTICS[Math.floor(roll * DIAGNOSTICS.length)];
  if (item !== undefined) {
    return item;
  }
  return { code: 'sensor', message: 'temperature sensor failed' };
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

const oneDecimal = (value: number): number => Math.round(value * 10) / 10;

export const createDevice = (options: CreateDeviceOptions): Device => {
  const now = options.now ?? Date.now;
  const nextId = options.nextId ?? randomUUID;
  const random = mulberry32(options.seed);
  let sequence = now();

  return {
    deviceId: options.deviceId,
    next: () => {
      const kind = KINDS[Math.floor(random() * KINDS.length)] ?? 'telemetry';
      const envelope = {
        eventId: nextId(),
        deviceId: options.deviceId,
        sequence,
      };
      sequence += 1;

      if (kind === 'telemetry') {
        return deviceEventSchema.parse({
          ...envelope,
          type: 'telemetry',
          status: random() < 0.5 ? 'up' : 'down',
          temperature: oneDecimal(20 + random() * 20),
          operations: 1,
        });
      }

      if (kind === 'cpu') {
        return deviceEventSchema.parse({
          ...envelope,
          type: 'cpu',
          cpu: oneDecimal(random() * 100),
        });
      }

      if (kind === 'ram') {
        return deviceEventSchema.parse({
          ...envelope,
          type: 'ram',
          ram: oneDecimal(random() * 100),
        });
      }

      if (kind === 'powered_on') {
        return deviceEventSchema.parse({
          ...envelope,
          type: 'powered_on',
          poweredOn: 1 + Math.floor(random() * 1000),
        });
      }

      const diagnostic = diagnosticOf(random());
      return deviceEventSchema.parse({
        ...envelope,
        type: 'diagnostic',
        code: diagnostic.code,
        message: diagnostic.message,
      });
    },
  };
};
