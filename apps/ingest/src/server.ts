import { createServer, type Server, type Socket } from 'node:net';
import {
  deviceEventSchema,
  PARTITION_COUNT,
  partitionQueue,
  queueForDevice,
  singleActiveConsumer,
} from '@rabbitmq-exercise/contracts';
import type { ConfirmChannel } from 'amqplib';
import pino, { type Logger } from 'pino';

export const MAX_FRAME_BYTES = 64 * 1024;

type BuildServerOptions = {
  logger: boolean;
};

export type IngestServer = Server & {
  log: Logger;
};

export const ensureQueue = async (channel: ConfirmChannel): Promise<void> => {
  for (let index = 0; index < PARTITION_COUNT; index += 1) {
    await channel.assertQueue(partitionQueue(index), {
      durable: true,
      arguments: singleActiveConsumer,
    });
  }
};

export const buildServer = (
  channel: ConfirmChannel,
  options: BuildServerOptions,
): IngestServer => {
  const log = pino({ enabled: options.logger });
  const server = createServer((socket) => {
    attachSocket(socket, channel, log);
  }) as IngestServer;
  server.log = log;
  server.on('listening', () => {
    const address = server.address();
    const port =
      address !== null && typeof address !== 'string'
        ? address.port
        : undefined;
    log.info({ port }, 'ingest listening');
  });
  return server;
};

export const listen = (
  server: Server,
  host: string,
  port: number,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const fail = (error: Error): void => {
      reject(error);
    };
    server.once('error', fail);
    server.listen(port, host, () => {
      server.off('error', fail);
      resolve();
    });
  });

const attachSocket = (
  socket: Socket,
  channel: ConfirmChannel,
  log: Logger,
): void => {
  let buffer: Buffer = Buffer.alloc(0);
  let chain = Promise.resolve();

  socket.on('error', () => {
    socket.destroy();
  });

  socket.on('data', (chunk: Buffer) => {
    if (socket.destroyed) {
      return;
    }

    socket.pause();
    buffer = Buffer.concat([buffer, chunk]);
    const taken = takeLines(buffer, socket, log);
    buffer = taken.rest;

    chain = chain
      .then(async () => {
        for (const line of taken.lines) {
          await publishLine(line, channel, log);
        }
      })
      .catch((error: unknown) => {
        log.error({ err: error }, 'failed to publish event');
        socket.destroy();
      })
      .finally(() => {
        if (!socket.destroyed) {
          socket.resume();
        }
      });
  });
};

const takeLines = (
  incoming: Buffer,
  socket: Socket,
  log: Logger,
): { lines: string[]; rest: Buffer } => {
  let rest = incoming;
  const lines: string[] = [];

  while (!socket.destroyed) {
    const newline = rest.indexOf(0x0a);
    if (newline === -1) {
      if (rest.length > MAX_FRAME_BYTES) {
        closeOversized(socket, log);
      }
      break;
    }

    if (newline > MAX_FRAME_BYTES) {
      closeOversized(socket, log);
      break;
    }

    lines.push(rest.subarray(0, newline).toString('utf8'));
    rest = Buffer.from(rest.subarray(newline + 1));
  }

  return { lines, rest: Buffer.from(rest) };
};

const closeOversized = (socket: Socket, log: Logger): void => {
  log.warn('closed connection after an oversized frame');
  socket.destroy();
};

const publishLine = async (
  line: string,
  channel: ConfirmChannel,
  log: Logger,
): Promise<void> => {
  if (line.length === 0) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    log.warn('dropped invalid event');
    return;
  }

  const result = deviceEventSchema.safeParse(parsed);
  if (!result.success) {
    log.warn('dropped invalid event');
    return;
  }

  channel.sendToQueue(
    queueForDevice(result.data.deviceId),
    Buffer.from(JSON.stringify(result.data)),
    {
      contentType: 'application/json',
      persistent: true,
    },
  );
  await channel.waitForConfirms();
};
