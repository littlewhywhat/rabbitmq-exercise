import { parsePartitionCount } from '@rabbitmq-exercise/contracts';
import amqp from 'amqplib';
import { MongoClient } from 'mongodb';
import pino from 'pino';
import { ensureIndexes } from './apply';
import { consumeTelemetry } from './consume';

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

  const partitionCount = parsePartitionCount(process.env.PARTITION_COUNT);
  const connection = await amqp.connect(rabbitUrl);
  const channel = await consumeTelemetry(connection, db, log, partitionCount);
  log.info({ partitionCount }, 'consuming telemetry');

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
