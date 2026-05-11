import type { AgentProviderId } from '../runtime/agentRuntimeTypes';
import type { AgentReplayRecoveryState } from '../runtime/replay/runtimeReplayRecovery.ts';
import type { RuntimeReplayEvent } from '../runtime/replay/runtimeReplayTypes.ts';
import type { ChatSession, ComposerPrefillPayload, StoredChatMessage } from './aiChatStore';

export type ChatSessionInitializedEvent = {
  id: string;
  kind: 'session_initialized';
  projectId: string;
  title: string;
  providerId: AgentProviderId;
  runtimeThreadId: string | null;
  composerPrefill: ComposerPrefillPayload | null;
  createdAt: number;
};

export type ChatSessionRuntimeThreadBoundEvent = {
  id: string;
  kind: 'runtime_thread_bound';
  providerId: AgentProviderId;
  runtimeThreadId: string;
  createdAt: number;
};

export type ChatSessionMessageAppendedEvent = {
  id: string;
  kind: 'message_appended';
  message: StoredChatMessage;
  createdAt: number;
};

export type ChatSessionMessageUpdatedEvent = {
  id: string;
  kind: 'message_updated';
  messageId: string;
  message: StoredChatMessage;
  createdAt: number;
};

export type ChatSessionMessagesReplacedEvent = {
  id: string;
  kind: 'messages_replaced';
  messages: StoredChatMessage[];
  createdAt: number;
};

export type ChatSessionComposerPrefillQueuedEvent = {
  id: string;
  kind: 'composer_prefill_queued';
  composerPrefill: ComposerPrefillPayload;
  createdAt: number;
};

export type ChatSessionComposerPrefillClearedEvent = {
  id: string;
  kind: 'composer_prefill_cleared';
  createdAt: number;
};

export type ChatSessionRenamedEvent = {
  id: string;
  kind: 'title_renamed';
  title: string;
  createdAt: number;
};

export type ChatSessionReplayStateSyncedEvent = {
  id: string;
  kind: 'replay_state_synced';
  replayThreadId: string;
  replayEvents: RuntimeReplayEvent[];
  recoveryState: AgentReplayRecoveryState | null;
  createdAt: number;
};

export type ChatSessionEvent =
  | ChatSessionInitializedEvent
  | ChatSessionRuntimeThreadBoundEvent
  | ChatSessionMessageAppendedEvent
  | ChatSessionMessageUpdatedEvent
  | ChatSessionMessagesReplacedEvent
  | ChatSessionComposerPrefillQueuedEvent
  | ChatSessionComposerPrefillClearedEvent
  | ChatSessionRenamedEvent
  | ChatSessionReplayStateSyncedEvent;

const createSessionEventId = (kind: ChatSessionEvent['kind']) =>
  `chat-session-event_${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createSessionInitializedEvent = (
  session: Pick<
    ChatSession,
    'projectId' | 'title' | 'providerId' | 'runtimeThreadId' | 'composerPrefill' | 'createdAt'
  >
): ChatSessionInitializedEvent => ({
  id: createSessionEventId('session_initialized'),
  kind: 'session_initialized',
  projectId: session.projectId,
  title: session.title,
  providerId: session.providerId,
  runtimeThreadId: session.runtimeThreadId,
  composerPrefill: session.composerPrefill || null,
  createdAt: session.createdAt,
});

const sortSessionEvents = (eventLog: ChatSessionEvent[]) =>
  [...eventLog].sort((left, right) => left.createdAt - right.createdAt);

const compactSessionEvents = (eventLog: ChatSessionEvent[]) => {
  const latestMessageUpdateIndexes = new Map<string, number>();

  eventLog.forEach((event, index) => {
    if (event.kind === 'message_updated') {
      latestMessageUpdateIndexes.set(event.messageId, index);
    }
  });

  return eventLog.filter(
    (event, index) =>
      event.kind !== 'message_updated' ||
      latestMessageUpdateIndexes.get(event.messageId) === index
  );
};

export const buildChatSessionProjection = (
  sessionId: string,
  eventLog: ChatSessionEvent[],
  fallbackSession?: Partial<ChatSession>
): ChatSession | null => {
  const ordered = sortSessionEvents(compactSessionEvents(eventLog));
  const initialized =
    ordered.find((event): event is ChatSessionInitializedEvent => event.kind === 'session_initialized') || null;

  if (!initialized && !fallbackSession?.projectId) {
    return null;
  }

  const createdAt = initialized?.createdAt || fallbackSession?.createdAt || Date.now();
  const base: ChatSession = {
    id: sessionId,
    projectId: initialized?.projectId || fallbackSession?.projectId || '',
    title: initialized?.title || fallbackSession?.title || 'New Chat',
    providerId: initialized?.providerId || fallbackSession?.providerId || 'built-in',
    runtimeThreadId:
      initialized?.runtimeThreadId ?? fallbackSession?.runtimeThreadId ?? null,
    composerPrefill: initialized?.composerPrefill ?? fallbackSession?.composerPrefill ?? null,
    messages: [],
    canonicalEvents: fallbackSession?.canonicalEvents || [],
    replayEvents: fallbackSession?.replayEvents || [],
    recoveryState: fallbackSession?.recoveryState || null,
    eventLog: ordered,
    createdAt,
    updatedAt: fallbackSession?.updatedAt || createdAt,
  };

  let projected = base;

  for (const event of ordered) {
    switch (event.kind) {
      case 'session_initialized':
        projected = {
          ...projected,
          projectId: event.projectId,
          title: event.title,
          providerId: event.providerId,
          runtimeThreadId: event.runtimeThreadId,
          composerPrefill: event.composerPrefill,
          createdAt: event.createdAt,
          updatedAt: Math.max(projected.updatedAt, event.createdAt),
        };
        break;
      case 'runtime_thread_bound':
        projected = {
          ...projected,
          providerId: event.providerId,
          runtimeThreadId: event.runtimeThreadId,
          updatedAt: Math.max(projected.updatedAt, event.createdAt),
        };
        break;
      case 'message_appended':
        projected = {
          ...projected,
          messages: [...projected.messages, event.message],
          updatedAt: Math.max(projected.updatedAt, event.createdAt),
        };
        break;
      case 'message_updated':
        projected = {
          ...projected,
          messages: projected.messages.map((message) =>
            message.id === event.messageId ? event.message : message
          ),
          updatedAt: Math.max(projected.updatedAt, event.createdAt),
        };
        break;
      case 'messages_replaced':
        projected = {
          ...projected,
          messages: [...event.messages],
          updatedAt: Math.max(projected.updatedAt, event.createdAt),
        };
        break;
      case 'composer_prefill_queued':
        projected = {
          ...projected,
          composerPrefill: event.composerPrefill,
          updatedAt: Math.max(projected.updatedAt, event.createdAt),
        };
        break;
      case 'composer_prefill_cleared':
        projected = {
          ...projected,
          composerPrefill: null,
          updatedAt: Math.max(projected.updatedAt, event.createdAt),
        };
        break;
      case 'title_renamed':
        projected = {
          ...projected,
          title: event.title,
          updatedAt: Math.max(projected.updatedAt, event.createdAt),
        };
        break;
      case 'replay_state_synced':
        projected = {
          ...projected,
          replayEvents: [...event.replayEvents],
          recoveryState: event.recoveryState,
          updatedAt: Math.max(projected.updatedAt, event.createdAt),
        };
        break;
      default:
        break;
    }
  }

  return projected;
};

export const appendChatSessionEvent = (
  session: ChatSession,
  event: ChatSessionEvent
): ChatSession => {
  const projected = buildChatSessionProjection(session.id, [...(session.eventLog || []), event], session);
  return projected || session;
};

export const ensureChatSessionEventLog = (session: ChatSession): ChatSessionEvent[] => {
  if (Array.isArray(session.eventLog) && session.eventLog.length > 0) {
    return sortSessionEvents(session.eventLog);
  }

  const replayEvents = session.replayEvents || [];
  const recoveryState = session.recoveryState || null;

  const eventLog: ChatSessionEvent[] = [createSessionInitializedEvent(session)];

  for (const message of session.messages || []) {
    eventLog.push({
      id: createSessionEventId('message_appended'),
      kind: 'message_appended',
      message,
      createdAt: message.createdAt,
    });
  }

  if (session.composerPrefill) {
    eventLog.push({
      id: createSessionEventId('composer_prefill_queued'),
      kind: 'composer_prefill_queued',
      composerPrefill: session.composerPrefill,
      createdAt: session.updatedAt,
    });
  }

  if (replayEvents.length > 0 || recoveryState) {
    eventLog.push({
      id: createSessionEventId('replay_state_synced'),
      kind: 'replay_state_synced',
      replayThreadId: recoveryState?.replayThreadId || replayEvents[0]?.threadId || session.runtimeThreadId || session.id,
      replayEvents: [...replayEvents],
      recoveryState,
      createdAt: session.updatedAt,
    });
  }

  return sortSessionEvents(eventLog);
};

export const createRuntimeThreadBoundEvent = (
  providerId: AgentProviderId,
  runtimeThreadId: string
): ChatSessionRuntimeThreadBoundEvent => ({
  id: createSessionEventId('runtime_thread_bound'),
  kind: 'runtime_thread_bound',
  providerId,
  runtimeThreadId,
  createdAt: Date.now(),
});

export const createMessageAppendedEvent = (
  message: StoredChatMessage
): ChatSessionMessageAppendedEvent => ({
  id: createSessionEventId('message_appended'),
  kind: 'message_appended',
  message,
  createdAt: Date.now(),
});

export const createMessageUpdatedEvent = (
  messageId: string,
  message: StoredChatMessage
): ChatSessionMessageUpdatedEvent => ({
  id: createSessionEventId('message_updated'),
  kind: 'message_updated',
  messageId,
  message,
  createdAt: Date.now(),
});

export const createMessagesReplacedEvent = (
  messages: StoredChatMessage[]
): ChatSessionMessagesReplacedEvent => ({
  id: createSessionEventId('messages_replaced'),
  kind: 'messages_replaced',
  messages,
  createdAt: Date.now(),
});

export const createComposerPrefillQueuedEvent = (
  composerPrefill: ComposerPrefillPayload
): ChatSessionComposerPrefillQueuedEvent => ({
  id: createSessionEventId('composer_prefill_queued'),
  kind: 'composer_prefill_queued',
  composerPrefill,
  createdAt: Date.now(),
});

export const createComposerPrefillClearedEvent = (): ChatSessionComposerPrefillClearedEvent => ({
  id: createSessionEventId('composer_prefill_cleared'),
  kind: 'composer_prefill_cleared',
  createdAt: Date.now(),
});

export const createSessionRenamedEvent = (title: string): ChatSessionRenamedEvent => ({
  id: createSessionEventId('title_renamed'),
  kind: 'title_renamed',
  title,
  createdAt: Date.now(),
});

export const createReplayStateSyncedEvent = (input: {
  replayThreadId: string;
  replayEvents: RuntimeReplayEvent[];
  recoveryState: AgentReplayRecoveryState | null;
}): ChatSessionReplayStateSyncedEvent => ({
  id: createSessionEventId('replay_state_synced'),
  kind: 'replay_state_synced',
  replayThreadId: input.replayThreadId,
  replayEvents: [...input.replayEvents],
  recoveryState: input.recoveryState,
  createdAt: Date.now(),
});
