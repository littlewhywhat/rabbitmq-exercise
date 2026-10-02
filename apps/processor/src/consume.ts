import {
  type DeviceEvent,
  deviceEventSchema,
  partitionQueue,
  singleActiveConsumer,
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
  partitionCount: number,
): Promise<Channel> => {
  const channel = await connection.createChannel();
  await channel.prefetch(1);
  for (let index = 0; index < partitionCount; index += 1) {
    const queue = partitionQueue(index);
    await channel.assertQueue(queue, {
      durable: true,
      arguments: singleActiveConsumer,
    });
    await channel.consume(queue, (message) => {
      if (message === null) {
        return;
      }
      void handleDelivery(channel, db, message, log);
    });
  }
  return channel;
};
