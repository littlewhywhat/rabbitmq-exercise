import {
  DEVICE_STATES_COLLECTION,
  deviceStateSchema,
  EVENTS_COLLECTION,
  type TelemetryEvent,
} from '@rabbitmq-exercise/contracts';
import { type Db, MongoServerError } from 'mongodb';
import { fold } from './fold';

export const ensureIndexes = async (db: Db): Promise<void> => {
  await db
    .collection(DEVICE_STATES_COLLECTION)
    .createIndex({ deviceId: 1 }, { unique: true });
  await db
    .collection(EVENTS_COLLECTION)
    .createIndex({ deviceId: 1, eventId: 1 }, { unique: true });
};

export const apply = async (
  db: Db,
  event: TelemetryEvent,
): Promise<'inserted' | 'duplicate'> => {
  try {
    await db.collection(EVENTS_COLLECTION).insertOne({ ...event });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return 'duplicate';
    }
    throw error;
  }

  const existing = await db
    .collection(DEVICE_STATES_COLLECTION)
    .findOne({ deviceId: event.deviceId });
  const snapshot = fold(
    existing === null ? null : deviceStateSchema.parse(existing),
    event,
  );
  await db
    .collection(DEVICE_STATES_COLLECTION)
    .replaceOne({ deviceId: event.deviceId }, snapshot, { upsert: true });
  return 'inserted';
};
