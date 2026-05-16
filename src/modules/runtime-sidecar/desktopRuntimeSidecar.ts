// 文件作用：模块实现文件，位于runtime sidecar 桥接层。
// 所在链路：负责把 sidecar 事件、快照与前端多个 store 接起来。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import { invoke } from '@tauri-apps/api/core';
// 这个文件负责前端与 desktop runtime sidecar 建立连接。
// 它会发现 sidecar、创建客户端并提供事件订阅入口，是前端接入桌面 runtime 的门面。
// 如果你在排查“前端为什么连不上 sidecar”，先看这里。
import {
  RuntimeSidecarClient,
  type RuntimeSidecarDescriptor,
} from '@goodnight/runtime-client';
import type { RuntimeEventEnvelope } from '@goodnight/runtime-protocol';
import { isTauriRuntimeAvailable } from '../../utils/projectPersistence';

// desktopRuntimeSidecar 负责桌面端 node runtime sidecar 的生命周期接入：
// - 启动 sidecar
// - 创建 RuntimeSidecarClient
// - 转发 runtime websocket 事件给前端订阅者
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
const TAURI_RUNTIME_UNAVAILABLE_MESSAGE =
  'Tauri runtime unavailable. Please run the desktop app with `npm run tauri dev` instead of opening the Vite web page.';

const emit = (status: RuntimeSidecarStatus) => {
  currentStatus = status;
  for (const listener of listeners) {
    listener(status);
  }
};

// runtime websocket 连接由这里统一维护，避免多个页面/模块各自重复连 sidecar。
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
  // 这个入口保证“要么复用现有 ready client，要么只启动一次新的 sidecar”。
  if (!isTauriRuntimeAvailable()) {
    emit({
      phase: 'error',
      descriptor: null,
      error: TAURI_RUNTIME_UNAVAILABLE_MESSAGE,
      client: null,
    });
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
