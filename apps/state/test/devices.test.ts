import {
  DEVICE_STATES_COLLECTION,
  type DeviceState,
  EVENTS_COLLECTION,
  type TelemetryEvent,
} from '@rabbitmq-exercise/contracts';
import { MongoDBContainer } from '@testcontainers/mongodb';
import type { FastifyInstance } from 'fastify';
import { type Db, MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, ensureIndexes } from '../src/app';

const device: DeviceState = {
  deviceId: 'device-1',
  lastSequence: 2,
  status: 'up',
  temperature: 41.5,
  operationCount: 3,
  cpu: null,
  ram: null,
  poweredOn: 0,
  diagnostic: null,
};

const event: TelemetryEvent = {
  type: 'telemetry',
  eventId: 'evt-1',
  deviceId: 'device-1',
  sequence: 2,
  status: 'up',
  temperature: 41.5,
  operations: 1,
};

const startMongo = async (): Promise<{
  uri: string;
  stop: () => Promise<void>;
}> => {
  const externalUri = process.env.MONGODB_URI;
  if (externalUri) {
    return {
      uri: externalUri,
      stop: async () => {},
    };
  }

  const container = await new MongoDBContainer('mongo:7').start();
  return {
    uri: container.getConnectionString(),
    stop: async () => {
      await container.stop();
    },
  };
};

describe('state service', () => {
  let stopMongo: () => Promise<void> = async () => {};
  let client: MongoClient;
  let db: Db;
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    const mongo = await startMongo();
    stopMongo = mongo.stop;
    client = new MongoClient(mongo.uri, { directConnection: true });
    await client.connect();
    db = client.db('state_test');
    await ensureIndexes(db);
    await db.collection(DEVICE_STATES_COLLECTION).deleteMany({});
    await db.collection(EVENTS_COLLECTION).deleteMany({});
    await db.collection(DEVICE_STATES_COLLECTION).insertOne({ ...device });
    await db.collection(EVENTS_COLLECTION).insertOne({ ...event });
    app = buildApp(db, { logger: false });
    baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  });

  afterAll(async () => {
    await app.close();
    await client.close();
    await stopMongo();
  });

  it('reads the device snapshot and its events', async () => {
    const stateResponse = await fetch(`${baseUrl}/devices/${device.deviceId}`);
    const eventsResponse = await fetch(
      `${baseUrl}/devices/${device.deviceId}/events`,
    );
    const missingResponse = await fetch(`${baseUrl}/devices/missing`);

    expect(stateResponse.status).toBe(200);
    expect(eventsResponse.status).toBe(200);
    expect(missingResponse.status).toBe(404);
    expect(await stateResponse.json()).toEqual(device);
    expect(await eventsResponse.json()).toEqual([event]);

    const eventIndexes = await db.collection(EVENTS_COLLECTION).indexes();
    const stateIndexes = await db
      .collection(DEVICE_STATES_COLLECTION)
      .indexes();
    expect(eventIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unique: true,
          key: { deviceId: 1, eventId: 1 },
        }),
      ]),
    );
    expect(stateIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unique: true,
          key: { deviceId: 1 },
        }),
      ]),
    );
  });
});
