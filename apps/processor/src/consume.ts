import {
  type DeviceEvent,
  deviceEventSchema,
  TELEMETRY_QUEUE,
} from '@rabbitmq-exercise/contracts';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import type { Db } from 'mongodb';
import type { Logger } from 'pino';
import { apply } from './apply';

export const parseTelemetryMessage = (content: Buffer): DeviceEvent | null => {
  try {
    return deviceEventSchema.parse(JSON.parse(content.toString('utf8')));
  } catch {
    return null;
  }
};

const handleDelivery = async (
  channel: Channel,
  db: Db,
  message: ConsumeMessage,
  log: Logger,
): Promise<void> => {
  const event = parseTelemetryMessage(message.content);
  if (event === null) {
    log.warn('dropped invalid telemetry message');
    channel.nack(message, false, false);
    return;
  }

  try {
    const result = await apply(db, event);
    channel.ack(message);
    log.info(
      { deviceId: event.deviceId, eventId: event.eventId, result },
      'applied device event',
    );
  } catch (error) {
    log.error({ err: error }, 'telemetry apply failed');
    channel.nack(message, false, true);
  }
};

export const consumeTelemetry = async (
  connection: ChannelModel,
  db: Db,
  log: Logger,
): Promise<Channel> => {
  const channel = await connection.createChannel();
  await channel.assertQueue(TELEMETRY_QUEUE, { durable: true });
  await channel.prefetch(1);
  await channel.consume(TELEMETRY_QUEUE, (message) => {
    if (message === null) {
      return;
    }
    void handleDelivery(channel, db, message, log);
  });
  return channel;
};
