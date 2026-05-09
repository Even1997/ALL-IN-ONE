import { invoke } from '@tauri-apps/api/core';
import {
  RuntimeSidecarClient,
  type RuntimeSidecarDescriptor,
} from '@goodnight/runtime-client';
import type { RuntimeEventEnvelope } from '@goodnight/runtime-protocol';
import { isTauriRuntimeAvailable } from '../../utils/projectPersistence';

type RuntimeSidecarStatus =
  | {
      phase: 'idle';
      descriptor: null;
      error: null;
      client: null;
    }
  | {
      phase: 'ready';
      descriptor: RuntimeSidecarDescriptor;
      error: null;
      client: RuntimeSidecarClient;
    }
  | {
      phase: 'error';
      descriptor: RuntimeSidecarDescriptor | null;
      error: string;
      client: RuntimeSidecarClient | null;
    };

const listeners = new Set<(status: RuntimeSidecarStatus) => void>();
const runtimeEventListeners = new Set<(event: RuntimeEventEnvelope) => void>();

let currentStatus: RuntimeSidecarStatus = {
  phase: 'idle',
  descriptor: null,
  error: null,
  client: null,
};
let startPromise: Promise<RuntimeSidecarClient | null> | null = null;
let runtimeSocket: WebSocket | null = null;

const emit = (status: RuntimeSidecarStatus) => {
  currentStatus = status;
  for (const listener of listeners) {
    listener(status);
  }
};

const attachRuntimeEvents = (client: RuntimeSidecarClient) => {
  runtimeSocket?.close();
  runtimeSocket = client.connect((event: RuntimeEventEnvelope) => {
    for (const listener of runtimeEventListeners) {
      listener(event);
    }

    if (event.type === 'runtime.ready') {
      emit({
        phase: 'ready',
        descriptor: currentStatus.descriptor!,
        error: null,
        client,
      });
    }
  });
};

export const ensureDesktopRuntimeSidecar = async (): Promise<RuntimeSidecarClient | null> => {
  if (!isTauriRuntimeAvailable()) {
    return null;
  }

  if (currentStatus.phase === 'ready' && currentStatus.client) {
    return currentStatus.client;
  }

  if (!startPromise) {
    startPromise = invoke<RuntimeSidecarDescriptor>('start_runtime_sidecar')
      .then(async (descriptor) => {
        const client = new RuntimeSidecarClient(descriptor);
        await client.health();
        emit({
          phase: 'ready',
          descriptor,
          error: null,
          client,
        });
        attachRuntimeEvents(client);
        return client;
      })
      .catch((error) => {
        emit({
          phase: 'error',
          descriptor: null,
          error: error instanceof Error ? error.message : String(error),
          client: null,
        });
        return null;
      })
      .finally(() => {
        startPromise = null;
      });
  }

  return startPromise;
};

export const getDesktopRuntimeSidecarStatus = () => currentStatus;

export const subscribeDesktopRuntimeSidecarStatus = (
  listener: (status: RuntimeSidecarStatus) => void,
) => {
  listeners.add(listener);
  listener(currentStatus);
  return () => {
    listeners.delete(listener);
  };
};

export const subscribeDesktopRuntimeEvents = (
  listener: (event: RuntimeEventEnvelope) => void,
) => {
  runtimeEventListeners.add(listener);
  return () => {
    runtimeEventListeners.delete(listener);
  };
};
