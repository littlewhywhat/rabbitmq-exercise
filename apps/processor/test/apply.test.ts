import {
  DEVICE_STATES_COLLECTION,
  type DeviceEvent,
  type DeviceState,
  deviceEventSchema,
  deviceStateSchema,
  EVENTS_COLLECTION,
  type TelemetryEvent,
} from '@rabbitmq-exercise/contracts';
import { MongoDBContainer } from '@testcontainers/mongodb';
import { type Db, MongoClient } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { apply, ensureIndexes } from '../src/apply';

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

const state = (overrides: Partial<DeviceState> = {}): DeviceState => ({
  deviceId: 'device-1',
  lastSequence: 1,
  status: 'up',
  temperature: 20,
  operationCount: 1,
  cpu: null,
  ram: null,
  poweredOn: 0,
  diagnostic: null,
  ...overrides,
});

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

describe('apply', () => {
  let stopMongo: () => Promise<void> = async () => {};
  let client: MongoClient;
  let db: Db;

  const readState = async (): Promise<DeviceState | null> => {
    const document = await db
      .collection(DEVICE_STATES_COLLECTION)
      .findOne({ deviceId: 'device-1' });
    return document === null ? null : deviceStateSchema.parse(document);
  };

  const readEvents = async (): Promise<DeviceEvent[]> => {
    const documents = await db
      .collection(EVENTS_COLLECTION)
      .find({ deviceId: 'device-1' })
      .sort({ sequence: 1 })
      .toArray();
    return documents.map((document) => deviceEventSchema.parse(document));
  };

  beforeAll(async () => {
    const mongo = await startMongo();
    stopMongo = mongo.stop;
    client = new MongoClient(mongo.uri, { directConnection: true });
    await client.connect();
    db = client.db('processor_test');
    await ensureIndexes(db);
  });

  beforeEach(async () => {
    await db.collection(DEVICE_STATES_COLLECTION).deleteMany({});
    await db.collection(EVENTS_COLLECTION).deleteMany({});
  });

  afterAll(async () => {
    await client.close();
    await stopMongo();
  });

  it('creates the snapshot for a new device', async () => {
    const first = event({ operations: 2, temperature: 33, status: 'down' });

    await expect(apply(db, first)).resolves.toBe('inserted');

    expect(await readEvents()).toEqual([first]);
    expect(await readState()).toEqual(
      state({
        status: 'down',
        temperature: 33,
        operationCount: 2,
      }),
    );
  });

  it('moves gauges when a newer sequence arrives', async () => {
    await apply(db, event());
    await apply(
      db,
      event({
        eventId: 'evt-2',
        sequence: 2,
        status: 'down',
        temperature: 40,
        operations: 3,
      }),
    );

    expect(await readState()).toEqual(
      state({
        lastSequence: 2,
        status: 'down',
        temperature: 40,
        operationCount: 4,
      }),
    );
  });

  it('keeps gauges when an older sequence arrives', async () => {
    await apply(db, event({ eventId: 'evt-5', sequence: 5, temperature: 50 }));
    await apply(
      db,
      event({
        eventId: 'evt-3',
        sequence: 3,
        status: 'down',
        temperature: 10,
        operations: 2,
      }),
    );

    expect(await readState()).toEqual(
      state({
        lastSequence: 5,
        temperature: 50,
        operationCount: 3,
      }),
    );
  });

  it('ignores a duplicate event id', async () => {
    const first = event();

    await apply(db, first);
    await expect(
      apply(db, event({ operations: 9, temperature: 99, status: 'down' })),
    ).resolves.toBe('duplicate');

    expect(await readEvents()).toEqual([first]);
    expect(await readState()).toEqual(state());
  });

  it('rebuilds the snapshot when the event is already stored', async () => {
    const first = event({ operations: 2, temperature: 33, status: 'down' });
    await db.collection(EVENTS_COLLECTION).insertOne({ ...first });

    await expect(apply(db, first)).resolves.toBe('duplicate');

    expect(await readState()).toEqual(
      state({
        status: 'down',
        temperature: 33,
        operationCount: 2,
      }),
    );
  });

  it('counts every event when applies overlap', async () => {
    const events = Array.from({ length: 40 }, (_, index) =>
      event({
        eventId: `evt-${index}`,
        sequence: index,
        temperature: index,
        status: index % 2 === 0 ? 'up' : 'down',
        operations: (index % 3) + 1,
      }),
    );

    await Promise.all(events.map((item) => apply(db, item)));

    expect(await readEvents()).toHaveLength(40);
    expect(await readState()).toEqual(
      state({
        lastSequence: 39,
        status: 'down',
        temperature: 39,
        operationCount: events.reduce((sum, item) => sum + item.operations, 0),
      }),
    );
  });

  it('counts one event when the same event is applied twice at once', async () => {
    const first = event({ operations: 4 });

    await Promise.all([apply(db, first), apply(db, first)]);

    expect(await readEvents()).toEqual([first]);
    expect(await readState()).toEqual(state({ operationCount: 4 }));
  });

  it('folds each kind on its own sequence', async () => {
    await apply(db, event({ eventId: 'tel-5', sequence: 5, temperature: 50 }));
    await apply(db, {
      type: 'cpu',
      eventId: 'cpu-10',
      deviceId: 'device-1',
      sequence: 10,
      cpu: 20,
    });
    await apply(
      db,
      event({
        eventId: 'tel-7',
        sequence: 7,
        temperature: 30,
        operations: 2,
      }),
    );
    await apply(db, {
      type: 'ram',
      eventId: 'ram-3',
      deviceId: 'device-1',
      sequence: 3,
      ram: 40,
    });
    await apply(db, {
      type: 'powered_on',
      eventId: 'on-1',
      deviceId: 'device-1',
      sequence: 4,
      poweredOn: 15,
    });
    await apply(db, {
      type: 'powered_on',
      eventId: 'on-1',
      deviceId: 'device-1',
      sequence: 4,
      poweredOn: 99,
    });
    await apply(db, {
      type: 'diagnostic',
      eventId: 'd-8',
      deviceId: 'device-1',
      sequence: 8,
      code: 'link',
      message: 'uplink interrupted',
    });
    await apply(db, {
      type: 'diagnostic',
      eventId: 'd-6',
      deviceId: 'device-1',
      sequence: 6,
      code: 'sensor',
      message: 'temperature sensor failed',
    });

    expect(await readState()).toEqual(
      state({
        lastSequence: 10,
        temperature: 30,
        operationCount: 3,
        cpu: 20,
        ram: 40,
        poweredOn: 15,
        diagnostic: { code: 'link', message: 'uplink interrupted' },
      }),
    );
  });
});
