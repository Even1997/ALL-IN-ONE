import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntimeAvailable } from '../../../../utils/projectPersistence';
import type { RuntimeReplayEvent } from './runtimeReplayTypes';

export const appendRuntimeReplayEvent = (input: {
  threadId: string;
  eventType: string;
  payload: string;
}): Promise<RuntimeReplayEvent> =>
  isTauriRuntimeAvailable()
    ? invoke<RuntimeReplayEvent>('append_runtime_replay_event', { input })
    : Promise.resolve({
        id: `replay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        threadId: input.threadId,
        eventType: input.eventType,
        payload: input.payload,
        createdAt: Date.now(),
      });

export const listRuntimeReplayEvents = (threadId: string): Promise<RuntimeReplayEvent[]> =>
  isTauriRuntimeAvailable()
    ? invoke<RuntimeReplayEvent[]>('list_runtime_replay_events', { threadId })
    : Promise.resolve([]);
