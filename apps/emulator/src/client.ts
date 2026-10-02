import { createConnection, type Socket } from 'node:net';
import type { DeviceEvent } from '@rabbitmq-exercise/contracts';
import type { Logger } from 'pino';
import type { Device } from './device';

type ConnectDeviceOptions = {
  host: string;
  port: number;
  device: Device;
  intervalMs: number;
  log: Logger;
};

export type DeviceConnection = {
  stop: () => void;
};

const writeEvent = (socket: Socket, event: DeviceEvent): void => {
  socket.write(`${JSON.stringify(event)}\n`);
};

export const connectDevice = (
  options: ConnectDeviceOptions,
): DeviceConnection => {
  let socket: Socket | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const connect = (): void => {
    if (stopped) {
      return;
    }

    const current = createConnection({
      host: options.host,
      port: options.port,
    });
    socket = current;

    current.on('error', () => {
      current.destroy();
    });

    current.on('connect', () => {
      options.log.info(
        { deviceId: options.device.deviceId },
        'device connected',
      );
      timer = setInterval(() => {
        if (current.destroyed || !current.writable) {
          return;
        }

        const event = options.device.next();
        writeEvent(current, event);
        options.log.info(
          {
            deviceId: event.deviceId,
            eventId: event.eventId,
            sequence: event.sequence,
          },
          'event sent',
        );
      }, options.intervalMs);
    });

    current.on('close', () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
      if (stopped) {
        return;
      }

      options.log.info(
        { deviceId: options.device.deviceId },
        'device reconnecting',
      );
      retry = setTimeout(connect, options.intervalMs);
    });
  };

  connect();

  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
      }
      if (retry) {
        clearTimeout(retry);
      }
      socket?.destroy();
    },
  };
};
