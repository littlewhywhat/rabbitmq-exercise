import { PARTITION_COUNT } from '@rabbitmq-exercise/contracts';
import amqp from 'amqplib';
import { MongoClient } from 'mongodb';
import pino from 'pino';
import { ensureIndexes } from './apply';
import { consumeTelemetry } from './consume';

const parsePartitions = (value: string | undefined): number[] => {
  if (value === undefined || value.trim() === '') {
    return Array.from({ length: PARTITION_COUNT }, (_, index) => index);
  }

  const indexes = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number(part));
  if (
    indexes.length === 0 ||
    indexes.some(
      (index) =>
        !Number.isInteger(index) || index < 0 || index >= PARTITION_COUNT,
    )
  ) {
    throw new Error(
      `PARTITIONS must list indexes from 0 to ${String(PARTITION_COUNT - 1)}`,
    );
  }

  return indexes;
};

const main = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }
  const rabbitUrl = process.env.RABBITMQ_URL;
  if (!rabbitUrl) {
    throw new Error('RABBITMQ_URL is required');
  }

  const databaseName = process.env.MONGODB_DB ?? 'telemetry';
  const log = pino();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(databaseName);
  await ensureIndexes(db);
  log.info({ db: databaseName }, 'indexes ready');

  const partitions = parsePartitions(process.env.PARTITIONS);
  const connection = await amqp.connect(rabbitUrl);
  const channel = await consumeTelemetry(connection, db, log, partitions);
  log.info({ partitions }, 'consuming telemetry');

  const shutdown = async (): Promise<void> => {
    await channel.close();
    await connection.close();
    await client.close();
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
};

void main();
