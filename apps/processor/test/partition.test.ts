import {
  DEFAULT_PARTITION_COUNT,
  partitionIndex,
  queueForDevice,
} from '@rabbitmq-exercise/contracts';
import { describe, expect, it } from 'vitest';

describe('device partitions', () => {
  it('keeps one device on one queue', () => {
    const queue = queueForDevice('device-1', DEFAULT_PARTITION_COUNT);

    expect(queueForDevice('device-1', DEFAULT_PARTITION_COUNT)).toBe(queue);
    expect(
      partitionIndex('device-1', DEFAULT_PARTITION_COUNT),
    ).toBeGreaterThanOrEqual(0);
    expect(partitionIndex('device-1', DEFAULT_PARTITION_COUNT)).toBeLessThan(
      DEFAULT_PARTITION_COUNT,
    );
  });

  it('spreads devices across more than one queue', () => {
    const queues = new Set(
      [
        'device-1',
        'device-2',
        'device-3',
        'device-4',
        'device-5',
        'device-6',
        'device-7',
        'device-8',
      ].map((deviceId) => queueForDevice(deviceId, DEFAULT_PARTITION_COUNT)),
    );

    expect(queues.size).toBeGreaterThan(1);
  });
});
