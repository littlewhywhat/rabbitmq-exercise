import {
  cpuEventSchema,
  DEVICE_STATES_COLLECTION,
  type DeviceEvent,
  diagnosticEventSchema,
  EVENTS_COLLECTION,
  ramEventSchema,
  type TelemetryEvent,
  telemetryEventSchema,
} from '@rabbitmq-exercise/contracts';
import { type Db, type Document, MongoServerError } from 'mongodb';

const REBUILD_ATTEMPTS = 5;

type StoredSnapshot = {
  operationCount: number;
  poweredOn: number;
  eventCount: number;
  lastSequence: number;
  status: TelemetryEvent['status'] | null;
  temperature: number | null;
  cpu: number | null;
  ram: number | null;
  diagnostic: { code: string; message: string } | null;
};

const duplicateKey = (error: unknown): boolean =>
  error instanceof MongoServerError && error.code === 11000;

export const ensureIndexes = async (db: Db): Promise<void> => {
  await db
    .collection(DEVICE_STATES_COLLECTION)
    .createIndex({ deviceId: 1 }, { unique: true });
  await db
    .collection(EVENTS_COLLECTION)
    .createIndex({ deviceId: 1, eventId: 1 }, { unique: true });
  await db
    .collection(EVENTS_COLLECTION)
    .createIndex({ deviceId: 1, sequence: -1 });
};

const readLatest = async (
  db: Db,
  deviceId: string,
  type: DeviceEvent['type'],
): Promise<Document | null> =>
  db
    .collection(EVENTS_COLLECTION)
    .find({ deviceId, type })
    .sort({ sequence: -1, _id: 1 })
    .limit(1)
    .next();

const readSnapshot = async (
  db: Db,
  deviceId: string,
): Promise<StoredSnapshot | null> => {
  const [totals] = await db
    .collection(EVENTS_COLLECTION)
    .aggregate<{
      operationCount: number;
      poweredOn: number;
      eventCount: number;
      lastSequence: number;
    }>([
      { $match: { deviceId } },
      {
        $group: {
          _id: null,
          operationCount: { $sum: { $ifNull: ['$operations', 0] } },
          poweredOn: { $sum: { $ifNull: ['$poweredOn', 0] } },
          eventCount: { $sum: 1 },
          lastSequence: { $max: '$sequence' },
        },
      },
    ])
    .toArray();

  if (totals === undefined) {
    return null;
  }

  const telemetryDoc = await readLatest(db, deviceId, 'telemetry');
  const cpuDoc = await readLatest(db, deviceId, 'cpu');
  const ramDoc = await readLatest(db, deviceId, 'ram');
  const diagnosticDoc = await readLatest(db, deviceId, 'diagnostic');
  const telemetry =
    telemetryDoc === null ? null : telemetryEventSchema.parse(telemetryDoc);
  const cpu = cpuDoc === null ? null : cpuEventSchema.parse(cpuDoc);
  const ram = ramDoc === null ? null : ramEventSchema.parse(ramDoc);
  const diagnostic =
    diagnosticDoc === null ? null : diagnosticEventSchema.parse(diagnosticDoc);

  return {
    operationCount: totals.operationCount,
    poweredOn: totals.poweredOn,
    eventCount: totals.eventCount,
    lastSequence: totals.lastSequence,
    status: telemetry?.status ?? null,
    temperature: telemetry?.temperature ?? null,
    cpu: cpu?.cpu ?? null,
    ram: ram?.ram ?? null,
    diagnostic:
      diagnostic === null
        ? null
        : { code: diagnostic.code, message: diagnostic.message },
  };
};

const writeSnapshot = async (
  db: Db,
  deviceId: string,
  snapshot: StoredSnapshot,
): Promise<'written' | 'stale'> => {
  const stored = {
    deviceId,
    lastSequence: snapshot.lastSequence,
    status: snapshot.status,
    temperature: snapshot.temperature,
    operationCount: snapshot.operationCount,
    cpu: snapshot.cpu,
    ram: snapshot.ram,
    poweredOn: snapshot.poweredOn,
    diagnostic: snapshot.diagnostic,
    eventCount: snapshot.eventCount,
  };
  const updated = await db
    .collection(DEVICE_STATES_COLLECTION)
    .updateOne(
      { deviceId, eventCount: { $lt: snapshot.eventCount } },
      { $set: stored },
    );
  if (updated.matchedCount === 1) {
    return 'written';
  }

  try {
    await db.collection(DEVICE_STATES_COLLECTION).insertOne(stored);
    return 'written';
  } catch (error) {
    if (duplicateKey(error)) {
      return 'stale';
    }
    throw error;
  }
};

const rebuildSnapshot = async (db: Db, deviceId: string): Promise<void> => {
  let seenCount = -1;
  for (let attempt = 0; attempt < REBUILD_ATTEMPTS; attempt += 1) {
    const snapshot = await readSnapshot(db, deviceId);
    if (snapshot === null) {
      return;
    }
    if (snapshot.eventCount <= seenCount) {
      return;
    }

    const outcome = await writeSnapshot(db, deviceId, snapshot);
    if (outcome === 'written') {
      return;
    }
    seenCount = snapshot.eventCount;
  }

  throw new Error(`snapshot rebuild conflicted for ${deviceId}`);
};

export const apply = async (
  db: Db,
  event: DeviceEvent,
): Promise<'inserted' | 'duplicate'> => {
  let outcome: 'inserted' | 'duplicate' = 'inserted';
  try {
    await db.collection(EVENTS_COLLECTION).insertOne({ ...event });
  } catch (error) {
    if (!duplicateKey(error)) {
      throw error;
    }
    outcome = 'duplicate';
  }

  await rebuildSnapshot(db, event.deviceId);
  return outcome;
};
