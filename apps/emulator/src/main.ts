import pino from 'pino';
import { connectDevice, type DeviceConnection } from './client';
import { createDevice } from './device';

const readNumber = (
  name: string,
  fallback: number,
  minimum: number,
): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }

  return value;
};

const main = (): void => {
  const host = process.env.INGEST_HOST || '127.0.0.1';
  const port = readNumber('INGEST_PORT', 4000, 1);
  const deviceCount = readNumber('DEVICE_COUNT', 2, 1);
  const intervalMs = readNumber('INTERVAL_MS', 1000, 1);
  const seed = readNumber('SEED', 1, 0);
  const log = pino();
  const connections: DeviceConnection[] = [];

  for (let index = 0; index < deviceCount; index += 1) {
    const deviceId = `device-${index + 1}`;
    const device = createDevice({
      deviceId,
      seed: seed + index,
    });
    connections.push(
      connectDevice({
        host,
        port,
        device,
        intervalMs,
        log,
      }),
    );
  }

  log.info({ host, port, deviceCount, intervalMs, seed }, 'emulator started');

  const shutdown = (): void => {
    for (const connection of connections) {
      connection.stop();
    }
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
};

main();
