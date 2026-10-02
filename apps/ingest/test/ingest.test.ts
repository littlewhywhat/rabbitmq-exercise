import { once } from 'node:events';
import { connect as connectNet, type Socket } from 'node:net';
import {
  TELEMETRY_QUEUE,
  type TelemetryEvent,
  telemetryEventSchema,
} from '@rabbitmq-exercise/contracts';
import { RabbitMQContainer } from '@testcontainers/rabbitmq';
import {
  type ChannelModel,
  type ConfirmChannel,
  connect as connectAmqp,
} from 'amqplib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildServer,
  ensureQueue,
  type IngestServer,
  listen,
  MAX_FRAME_BYTES,
} from '../src/server';

const event = (eventId: string, sequence: number): TelemetryEvent => ({
  type: 'telemetry',
  eventId,
  deviceId: 'device-1',
  sequence,
  status: 'up',
  temperature: 41.5,
  operations: 1,
});

const startRabbit = async (): Promise<{
  url: string;
  stop: () => Promise<void>;
}> => {
  const externalUrl = process.env.RABBITMQ_URL;
  if (externalUrl) {
    return {
      url: externalUrl,
      stop: async () => {},
    };
  }

  const container = await new RabbitMQContainer(
    'rabbitmq:3-management',
  ).start();
  return {
    url: container.getAmqpUrl(),
    stop: async () => {
      await container.stop();
    },
  };
};

const write = (socket: Socket, data: string | Buffer): Promise<void> =>
  new Promise((resolve) => {
    socket.write(data, () => {
      resolve();
    });
  });

const waitFor = async (
  received: TelemetryEvent[],
  count: number,
): Promise<void> => {
  const deadline = Date.now() + 5000;
  while (received.length < count) {
    if (Date.now() > deadline) {
      throw new Error(`timed out with ${String(received.length)} messages`);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }
};

describe('socket ingest', () => {
  let stopRabbit: () => Promise<void> = async () => {};
  let client: ChannelModel;
  let channel: ConfirmChannel;
  let server: IngestServer;
  let port = 0;
  const received: TelemetryEvent[] = [];

  beforeAll(async () => {
    const rabbit = await startRabbit();
    stopRabbit = rabbit.stop;
    client = await connectAmqp(rabbit.url);
    client.on('error', () => undefined);
    channel = await client.createConfirmChannel();
    await ensureQueue(channel);
    server = buildServer(channel, { logger: false });
    await listen(server, '127.0.0.1', 0);
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a TCP port');
    }
    port = address.port;

    await channel.consume(TELEMETRY_QUEUE, (message) => {
      if (message === null) {
        return;
      }
      received.push(
        telemetryEventSchema.parse(JSON.parse(message.content.toString())),
      );
      channel.ack(message);
    });
  });

  beforeEach(async () => {
    received.length = 0;
    await channel.purgeQueue(TELEMETRY_QUEUE);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await client.close();
    await stopRabbit();
  });

  it('publishes valid lines and drops a bad one', async () => {
    const first = event('evt-1', 1);
    const second = event('evt-2', 2);
    const third = event('evt-3', 3);
    const raw = JSON.stringify(first);
    const socket = connectNet(port, '127.0.0.1');
    await once(socket, 'connect');

    await write(socket, raw.slice(0, 12));
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    await write(socket, `${raw.slice(12)}\n`);
    await write(socket, 'not-json\n');
    await write(
      socket,
      `${JSON.stringify(second)}\n${JSON.stringify(third)}\n`,
    );

    await waitFor(received, 3);
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(socket.destroyed).toBe(false);
    expect(received).toEqual([first, second, third]);
    socket.end();
  });

  it('closes a connection that exceeds the frame cap', async () => {
    const socket = connectNet(port, '127.0.0.1');
    await once(socket, 'connect');
    const closed = once(socket, 'close');
    await write(socket, Buffer.alloc(MAX_FRAME_BYTES + 1, 0x78));
    await closed;
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(received).toEqual([]);
  });
});
