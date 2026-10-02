import {
  DEVICE_STATES_COLLECTION,
  EVENTS_COLLECTION,
  type TelemetryEvent,
  telemetryEventSchema,
} from '@rabbitmq-exercise/contracts';
import { type Db, MongoServerError } from 'mongodb';

const REBUILD_ATTEMPTS = 5;

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

const readSnapshot = async (
  db: Db,
  deviceId: string,
): Promise<{
  operationCount: number;
  eventCount: number;
  lastSequence: number;
  status: TelemetryEvent['status'];
  temperature: number;
} | null> => {
  const [totals] = await db
    .collection(EVENTS_COLLECTION)
    .aggregate<{ operationCount: number; eventCount: number }>([
      { $match: { deviceId } },
      {
        $group: {
          _id: null,
          operationCount: { $sum: '$operations' },
          eventCount: { $sum: 1 },
        },
      },
    ])
    .toArray();

  if (totals === undefined) {
    return null;
  }

  const latest = await db
    .collection(EVENTS_COLLECTION)
    .find({ deviceId })
    .sort({ sequence: -1, _id: 1 })
    .limit(1)
    .next();

  if (latest === null) {
    return null;
  }

  const event = telemetryEventSchema.parse(latest);
  return {
    operationCount: totals.operationCount,
    eventCount: totals.eventCount,
    lastSequence: event.sequence,
    status: event.status,
    temperature: event.temperature,
  };
};

const writeSnapshot = async (
  db: Db,
  deviceId: string,
  snapshot: {
    operationCount: number;
    eventCount: number;
    lastSequence: number;
    status: TelemetryEvent['status'];
    temperature: number;
  },
): Promise<'written' | 'stale'> => {
  const updated = await db.collection(DEVICE_STATES_COLLECTION).updateOne(
    { deviceId, eventCount: { $lt: snapshot.eventCount } },
    {
      $set: {
        deviceId,
        lastSequence: snapshot.lastSequence,
        status: snapshot.status,
        temperature: snapshot.temperature,
        operationCount: snapshot.operationCount,
        eventCount: snapshot.eventCount,
      },
    },
  );
  if (updated.matchedCount === 1) {
    return 'written';
  }

  try {
    await db.collection(DEVICE_STATES_COLLECTION).insertOne({
      deviceId,
      lastSequence: snapshot.lastSequence,
      status: snapshot.status,
      temperature: snapshot.temperature,
      operationCount: snapshot.operationCount,
      eventCount: snapshot.eventCount,
    });
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
  event: TelemetryEvent,
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
