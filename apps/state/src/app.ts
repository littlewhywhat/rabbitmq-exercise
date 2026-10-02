import {
  DEVICE_STATES_COLLECTION,
  deviceStateSchema,
  EVENTS_COLLECTION,
  telemetryEventSchema,
} from '@rabbitmq-exercise/contracts';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from 'mongodb';

type BuildAppOptions = {
  logger: boolean;
};

export const EVENT_READ_LIMIT = 100;

export const ensureIndexes = async (db: Db): Promise<void> => {
  await db
    .collection(DEVICE_STATES_COLLECTION)
    .createIndex({ deviceId: 1 }, { unique: true });
  await db
    .collection(EVENTS_COLLECTION)
    .createIndex({ deviceId: 1, eventId: 1 }, { unique: true });
};

export const buildApp = (db: Db, options: BuildAppOptions): FastifyInstance => {
  const app = Fastify({ logger: options.logger });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get<{ Params: { deviceId: string } }>(
    '/devices/:deviceId',
    async (request, reply) => {
      const document = await db
        .collection(DEVICE_STATES_COLLECTION)
        .findOne({ deviceId: request.params.deviceId });

      if (document === null) {
        return reply.code(404).send({ message: 'Device not found' });
      }

      return deviceStateSchema.parse(document);
    },
  );

  app.get<{ Params: { deviceId: string } }>(
    '/devices/:deviceId/events',
    async (request) => {
      const documents = await db
        .collection(EVENTS_COLLECTION)
        .find({ deviceId: request.params.deviceId })
        .sort({ sequence: 1 })
        .limit(EVENT_READ_LIMIT)
        .toArray();

      return documents.map((document) => telemetryEventSchema.parse(document));
    },
  );

  return app;
};
