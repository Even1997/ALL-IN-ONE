import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntimeAvailable } from '../../../../utils/projectPersistence';
import { ensureDesktopRuntimeSidecar } from '../../../runtime-sidecar/desktopRuntimeSidecar.ts';
import type { RuntimeReplayEvent } from './runtimeReplayTypes';

const mapRuntimeSidecarReplayEvent = (event: {
  id: string;
  sessionId: string;
  eventType: string;
  payload: string;
  createdAt: number;
}): RuntimeReplayEvent => ({
  id: event.id,
  threadId: event.sessionId,
  eventType: event.eventType,
  payload: event.payload,
  createdAt: event.createdAt,
});

export const appendRuntimeReplayEvent = (input: {
  threadId: string;
  eventType: string;
  payload: string;
}): Promise<RuntimeReplayEvent> =>
  isTauriRuntimeAvailable()
    ? ensureDesktopRuntimeSidecar().then((client) =>
        client
          ? client.appendReplayEvent({
              sessionId: input.threadId,
              eventType: input.eventType,
              payload: input.payload,
            }).then(mapRuntimeSidecarReplayEvent)
          : invoke<RuntimeReplayEvent>('append_runtime_replay_event', { input }),
      )
    : Promise.resolve({
        id: `replay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        threadId: input.threadId,
        eventType: input.eventType,
        payload: input.payload,
        createdAt: Date.now(),
      });

export const listRuntimeReplayEvents = (threadId: string): Promise<RuntimeReplayEvent[]> =>
  isTauriRuntimeAvailable()
    ? ensureDesktopRuntimeSidecar().then((client) =>
        client
          ? client.listReplayEvents(threadId).then((events) => events.map(mapRuntimeSidecarReplayEvent))
          : invoke<RuntimeReplayEvent[]>('list_runtime_replay_events', { threadId }),
      )
    : Promise.resolve([]);
