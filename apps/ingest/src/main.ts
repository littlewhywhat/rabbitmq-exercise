import { connect } from 'amqplib';
import { buildServer, ensureQueue, listen } from './server';

const main = async (): Promise<void> => {
  const url = process.env.RABBITMQ_URL;
  if (!url) {
    throw new Error('RABBITMQ_URL is required');
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  const connection = await connect(url);
  connection.on('error', () => undefined);
  const channel = await connection.createConfirmChannel();
  await ensureQueue(channel);
  const server = buildServer(channel, { logger: true });
  server.log.info('queue ready');

  const shutdown = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await connection.close();
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });

  await listen(server, '0.0.0.0', port);
};

void main();
