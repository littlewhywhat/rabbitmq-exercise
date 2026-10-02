import type { ConsumeMessage } from 'amqplib';
import type { Db } from 'mongodb';
import type { Logger } from 'pino';
import { describe, expect, it } from 'vitest';
import { handleDelivery } from '../src/consume';

const event = {
  type: 'telemetry',
  eventId: 'evt-1',
  deviceId: 'device-1',
  sequence: 1,
  status: 'up',
  temperature: 20,
  operations: 1,
};

const log = {
  warn: () => {},
  info: () => {},
  error: () => {},
} as unknown as Logger;

const message = (content: string): ConsumeMessage =>
  ({ content: Buffer.from(content) }) as ConsumeMessage;

describe('handleDelivery', () => {
  it('drops an invalid payload', async () => {
    const actions: Array<{ requeue: boolean }> = [];
    const channel = {
      ack: () => {},
      nack: (_message: ConsumeMessage, _allUpTo: boolean, requeue: boolean) => {
        actions.push({ requeue });
      },
    };

    await handleDelivery(channel as never, {} as Db, message('not-json'), log);

    expect(actions).toEqual([{ requeue: false }]);
  });

  it('returns the message to the queue when the write fails', async () => {
    const actions: Array<{ requeue: boolean }> = [];
    const channel = {
      ack: () => {},
      nack: (_message: ConsumeMessage, _allUpTo: boolean, requeue: boolean) => {
        actions.push({ requeue });
      },
    };
    const db = {
      collection: () => {
        throw new Error('mongo down');
      },
    } as unknown as Db;

    await handleDelivery(
      channel as never,
      db,
      message(JSON.stringify(event)),
      log,
    );

    expect(actions).toEqual([{ requeue: true }]);
  });
});
