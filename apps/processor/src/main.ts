import amqp from 'amqplib';
import { MongoClient } from 'mongodb';
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
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(databaseName);
  await ensureIndexes(db);
  console.log(
    JSON.stringify({ level: 'info', db: databaseName, msg: 'indexes ready' }),
  );

  const connection = await amqp.connect(rabbitUrl);
  const channel = await consumeTelemetry(connection, db);
  console.log(JSON.stringify({ level: 'info', msg: 'consuming telemetry' }));

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
