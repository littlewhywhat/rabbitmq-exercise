import { createServer, type Server, type Socket } from 'node:net';
import {
  type TelemetryEvent,
  telemetryEventSchema,
} from '@rabbitmq-exercise/contracts';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectDevice, type DeviceConnection } from '../src/client';
import { createDevice } from '../src/device';

const log = pino({ level: 'silent' });

const listen = async (server: Server): Promise<number> => {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('server did not bind a port');
  }
  return address.port;
};

const readFrames = (socket: Socket, frames: TelemetryEvent[]): void => {
  let buffer = '';
  socket.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      frames.push(telemetryEventSchema.parse(JSON.parse(line)));
      newline = buffer.indexOf('\n');
    }
  });
};

const flush = async (): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
};

const waitFor = async (ready: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (ready()) {
      return;
    }
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
  throw new Error('timed out waiting for the emulator');
};

describe('connectDevice', () => {
  const connections: DeviceConnection[] = [];
  let server: Server | undefined;

  afterEach(async () => {
    for (const connection of connections) {
      connection.stop();
    }
    connections.length = 0;
    vi.useRealTimers();
    if (server) {
      const closing = server;
      server = undefined;
      await new Promise<void>((resolve, reject) => {
        closing.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it('sends one frame per device on each tick', async () => {
    const frames: TelemetryEvent[] = [];
    const sockets: Socket[] = [];
    server = createServer((socket) => {
      sockets.push(socket);
      readFrames(socket, frames);
    });
    const port = await listen(server);
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });

    for (const [index, deviceId] of ['device-1', 'device-2'].entries()) {
      connections.push(
        connectDevice({
          host: '127.0.0.1',
          port,
          intervalMs: 1000,
          log,
          device: createDevice({
            deviceId,
            seed: index + 1,
            now: () => 1000 + index,
            nextId: () => `${deviceId}-${index}`,
          }),
        }),
      );
    }

    await waitFor(() => sockets.length === 2);
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    await waitFor(() => frames.length === 2);
    await vi.advanceTimersByTimeAsync(1000);
    await waitFor(() => frames.length === 4);

    const byDevice = (deviceId: string): TelemetryEvent[] =>
      frames.filter((frame) => frame.deviceId === deviceId);

    expect(sockets).toHaveLength(2);
    expect(byDevice('device-1').map((frame) => frame.sequence)).toEqual([
      1000, 1001,
    ]);
    expect(byDevice('device-2').map((frame) => frame.sequence)).toEqual([
      1001, 1002,
    ]);
  });

  it('continues the sequence after the socket drops', async () => {
    const frames: TelemetryEvent[] = [];
    const sockets: Socket[] = [];
    server = createServer((socket) => {
      sockets.push(socket);
      readFrames(socket, frames);
    });
    const port = await listen(server);
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });

    let nextId = 0;
    connections.push(
      connectDevice({
        host: '127.0.0.1',
        port,
        intervalMs: 1000,
        log,
        device: createDevice({
          deviceId: 'device-1',
          seed: 1,
          now: () => 5000,
          nextId: () => {
            nextId += 1;
            return `id-${nextId}`;
          },
        }),
      }),
    );

    await waitFor(() => sockets.length === 1);
    await vi.advanceTimersByTimeAsync(1000);
    await waitFor(() => frames.length === 1);

    const first = sockets[0];
    if (!first) {
      throw new Error('missing socket');
    }
    first.destroy();
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    await waitFor(() => sockets.length === 2);
    await vi.advanceTimersByTimeAsync(1000);
    await waitFor(() => frames.length === 2);

    expect(frames.map((frame) => frame.sequence)).toEqual([5000, 5001]);
    expect(frames.map((frame) => frame.eventId)).toEqual(['id-1', 'id-2']);
  });
});
