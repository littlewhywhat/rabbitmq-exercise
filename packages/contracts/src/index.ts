import { z } from 'zod';

export const deviceStatusSchema = z.enum(['up', 'down']);

export const telemetryEventSchema = z.object({
  type: z.literal('telemetry'),
  eventId: z.string().min(1),
  deviceId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  status: deviceStatusSchema,
  temperature: z.number(),
  operations: z.number().int().nonnegative(),
});

export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;

export const deviceStateSchema = z.object({
  deviceId: z.string().min(1),
  lastSequence: z.number().int().nonnegative(),
  status: deviceStatusSchema,
  temperature: z.number(),
  operationCount: z.number().int().nonnegative(),
});

export type DeviceState = z.infer<typeof deviceStateSchema>;

export const TELEMETRY_QUEUE = 'telemetry';

export const DEVICE_STATES_COLLECTION = 'device_states';

export const EVENTS_COLLECTION = 'events';
