import { z } from 'zod';

export const deviceStatusSchema = z.enum(['up', 'down']);

const eventEnvelope = {
  eventId: z.string().min(1),
  deviceId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
};

export const telemetryEventSchema = z.object({
  type: z.literal('telemetry'),
  ...eventEnvelope,
  status: deviceStatusSchema,
  temperature: z.number(),
  operations: z.number().int().nonnegative(),
});

export const cpuEventSchema = z.object({
  type: z.literal('cpu'),
  ...eventEnvelope,
  cpu: z.number(),
});

export const ramEventSchema = z.object({
  type: z.literal('ram'),
  ...eventEnvelope,
  ram: z.number(),
});

export const poweredOnEventSchema = z.object({
  type: z.literal('powered_on'),
  ...eventEnvelope,
  poweredOn: z.number().int().nonnegative(),
});

export const diagnosticEventSchema = z.object({
  type: z.literal('diagnostic'),
  ...eventEnvelope,
  code: z.string().min(1),
  message: z.string().min(1),
});

export const deviceEventSchema = z.discriminatedUnion('type', [
  telemetryEventSchema,
  cpuEventSchema,
  ramEventSchema,
  poweredOnEventSchema,
  diagnosticEventSchema,
]);

export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;

export type CpuEvent = z.infer<typeof cpuEventSchema>;

export type RamEvent = z.infer<typeof ramEventSchema>;

export type PoweredOnEvent = z.infer<typeof poweredOnEventSchema>;

export type DiagnosticEvent = z.infer<typeof diagnosticEventSchema>;

export type DeviceEvent = z.infer<typeof deviceEventSchema>;

export const diagnosticSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

export const deviceStateSchema = z.object({
  deviceId: z.string().min(1),
  lastSequence: z.number().int().nonnegative(),
  status: deviceStatusSchema.nullable(),
  temperature: z.number().nullable(),
  operationCount: z.number().int().nonnegative(),
  cpu: z.number().nullable(),
  ram: z.number().nullable(),
  poweredOn: z.number().int().nonnegative(),
  diagnostic: diagnosticSchema.nullable(),
});

export type DeviceState = z.infer<typeof deviceStateSchema>;

export const TELEMETRY_QUEUE = 'telemetry';

export const DEFAULT_PARTITION_COUNT = 4;

export const singleActiveConsumer = {
  'x-single-active-consumer': true,
} as const;

export const parsePartitionCount = (value: string | undefined): number => {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_PARTITION_COUNT;
  }

  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('PARTITION_COUNT must be a positive integer');
  }

  return count;
};

export const partitionQueue = (index: number): string =>
  `${TELEMETRY_QUEUE}-${index}`;

export const partitionIndex = (deviceId: string, count: number): number => {
  let hash = 0;
  for (const char of deviceId) {
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  }

  return hash % count;
};

export const queueForDevice = (deviceId: string, count: number): string =>
  partitionQueue(partitionIndex(deviceId, count));

export const DEVICE_STATES_COLLECTION = 'device_states';

export const EVENTS_COLLECTION = 'events';
