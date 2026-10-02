import {
  TELEMETRY_QUEUE,
  type TelemetryEvent,
  telemetryEventSchema,
} from '@rabbitmq-exercise/contracts';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import type { Db } from 'mongodb';
import { apply } from './apply';

export const parseTelemetryMessage = (
  content: Buffer,
): TelemetryEvent | null => {
  try {
    return telemetryEventSchema.parse(JSON.parse(content.toString('utf8')));
  } catch {
    return null;
  }
};

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  fields: Record<string, unknown> = {},
): void => {
  console.log(JSON.stringify({ level, msg, ...fields }));
};

const handleDelivery = async (
  channel: Channel,
  db: Db,
  message: ConsumeMessage,
): Promise<void> => {
  const event = parseTelemetryMessage(message.content);
  if (event === null) {
    log('warn', 'dropped invalid telemetry message');
    channel.nack(message, false, false);
    return;
  }

  try {
    const result = await apply(db, event);
    channel.ack(message);
    log('info', 'applied telemetry event', {
      deviceId: event.deviceId,
      eventId: event.eventId,
      result,
    });
  } catch (error) {
    log('error', 'telemetry apply failed', { err: String(error) });
    channel.nack(message, false, true);
  }
};

export const consumeTelemetry = async (
  connection: ChannelModel,
  db: Db,
): Promise<Channel> => {
  const channel = await connection.createChannel();
  await channel.assertQueue(TELEMETRY_QUEUE, { durable: true });
  await channel.prefetch(1);
  await channel.consume(TELEMETRY_QUEUE, (message) => {
    if (message === null) {
      return;
    }
    void handleDelivery(channel, db, message);
  });
  return channel;
};
