import { MongoClient } from 'mongodb';
import { buildApp, ensureIndexes } from './app';

const main = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const databaseName = process.env.MONGODB_DB ?? 'telemetry';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(databaseName);
  await ensureIndexes(db);
  const app = buildApp(db, { logger: true });
  app.log.info({ db: databaseName }, 'indexes ready');

  const shutdown = async (): Promise<void> => {
    await app.close();
    await client.close();
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });

  await app.listen({ host: '0.0.0.0', port });
};

void main();
