import type { DeviceEvent, DeviceState } from '@rabbitmq-exercise/contracts';

export type FoldSnapshot = DeviceState & {
  telemetrySequence: number | null;
  cpuSequence: number | null;
  ramSequence: number | null;
  diagnosticSequence: number | null;
};

const blank = (deviceId: string): FoldSnapshot => ({
  deviceId,
  lastSequence: 0,
  status: null,
  temperature: null,
  operationCount: 0,
  cpu: null,
  ram: null,
  poweredOn: 0,
  diagnostic: null,
  telemetrySequence: null,
  cpuSequence: null,
  ramSequence: null,
  diagnosticSequence: null,
});

const newer = (seen: number | null, sequence: number): boolean =>
  seen === null || sequence > seen;

export const fold = (
  snapshot: FoldSnapshot | null,
  event: DeviceEvent,
): FoldSnapshot => {
  const current = snapshot ?? blank(event.deviceId);
  const lastSequence = Math.max(current.lastSequence, event.sequence);
  const shared = {
    ...current,
    deviceId: event.deviceId,
    lastSequence,
  };

  if (event.type === 'telemetry') {
    const move = newer(current.telemetrySequence, event.sequence);
    return {
      ...shared,
      operationCount: current.operationCount + event.operations,
      status: move ? event.status : current.status,
      temperature: move ? event.temperature : current.temperature,
      telemetrySequence: move ? event.sequence : current.telemetrySequence,
    };
  }

  if (event.type === 'cpu') {
    const move = newer(current.cpuSequence, event.sequence);
    return {
      ...shared,
      cpu: move ? event.cpu : current.cpu,
      cpuSequence: move ? event.sequence : current.cpuSequence,
    };
  }

  if (event.type === 'ram') {
    const move = newer(current.ramSequence, event.sequence);
    return {
      ...shared,
      ram: move ? event.ram : current.ram,
      ramSequence: move ? event.sequence : current.ramSequence,
    };
  }

  if (event.type === 'powered_on') {
    return {
      ...shared,
      poweredOn: current.poweredOn + event.poweredOn,
    };
  }

  const move = newer(current.diagnosticSequence, event.sequence);
  return {
    ...shared,
    diagnostic: move
      ? { code: event.code, message: event.message }
      : current.diagnostic,
    diagnosticSequence: move ? event.sequence : current.diagnosticSequence,
  };
};
