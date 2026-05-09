import type { RuntimeEventEnvelope, RuntimeMessageRecord, RuntimeSessionSnapshot } from '@goodnight/runtime-protocol';
import type { AIConfigEntry } from '../ai/store/aiConfigState.ts';
import type { AgentProviderId, AgentThreadRecord } from '../ai/runtime/agentRuntimeTypes.ts';
import { useAgentRuntimeStore } from '../ai/runtime/agentRuntimeStore.ts';
import {
  createChatSession,
  createStoredChatMessage,
  type ChatSession,
  useAIChatStore,
} from '../ai/store/aiChatStore.ts';
import {
  ensureDesktopRuntimeSidecar,
  subscribeDesktopRuntimeEvents,
} from './desktopRuntimeSidecar';

const initializedProjects = new Set<string>();
let runtimeEventsSubscribed = false;

const toProviderId = (providerId?: string | null): AgentProviderId => {
  if (providerId === 'claude' || providerId === 'codex' || providerId === 'team') {
    return providerId;
  }

  return 'built-in';
};

const mapRuntimeMessage = (message: RuntimeMessageRecord) => {
  if (message.role === 'assistant') {
    return {
      ...createStoredChatMessage('assistant', message.content),
      id: message.id,
      createdAt: message.createdAt,
    };
  }

  return {
    ...createStoredChatMessage(message.role, message.content),
    id: message.id,
    createdAt: message.createdAt,
  };
};

const mapSnapshotToChatSession = (
  snapshot: RuntimeSessionSnapshot,
  existingSession?: ChatSession | null,
): ChatSession => {
  const providerId = toProviderId(snapshot.session.providerId);
  const baseSession = existingSession || createChatSession(snapshot.session.projectId, snapshot.session.title, providerId);

  return {
    ...baseSession,
    id: snapshot.session.id,
    projectId: snapshot.session.projectId,
    title: snapshot.session.title,
    providerId,
    runtimeThreadId: snapshot.session.id,
    messages: snapshot.messages.map(mapRuntimeMessage),
    eventLog: [],
    createdAt: snapshot.session.createdAt,
    updatedAt: snapshot.session.updatedAt,
  };
};

const mapSnapshotToRuntimeThread = (snapshot: RuntimeSessionSnapshot): AgentThreadRecord => ({
  id: snapshot.session.id,
  providerId: toProviderId(snapshot.session.providerId),
  title: snapshot.session.title,
  createdAt: snapshot.session.createdAt,
  updatedAt: snapshot.session.updatedAt,
});

const mapRuntimeConfig = (config?: AIConfigEntry | null) => {
  if (!config) {
    return null;
  }

  return {
    provider: config.provider,
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    model: config.model,
    contextWindowTokens: config.contextWindowTokens,
    customHeaders: config.customHeaders,
  };
};

export const applyRuntimeSidecarSnapshot = (snapshot: RuntimeSessionSnapshot) => {
  const chatStore = useAIChatStore.getState();
  const runtimeStore = useAgentRuntimeStore.getState();
  const existingSession =
    chatStore.projects[snapshot.session.projectId]?.sessions.find(
      (session) => session.id === snapshot.session.id,
    ) || null;
  const nextSession = mapSnapshotToChatSession(snapshot, existingSession);

  chatStore.ensureProjectState(snapshot.session.projectId);
  chatStore.upsertSession(snapshot.session.projectId, nextSession);
  chatStore.replaceSessionMessages(snapshot.session.projectId, nextSession.id, nextSession.messages);
  runtimeStore.createThread(snapshot.session.projectId, mapSnapshotToRuntimeThread(snapshot));
};

const ensureRuntimeEventSubscription = () => {
  if (runtimeEventsSubscribed) {
    return;
  }

  runtimeEventsSubscribed = true;
  subscribeDesktopRuntimeEvents((event: RuntimeEventEnvelope) => {
    if (event.type === 'session.snapshot') {
      applyRuntimeSidecarSnapshot(event.payload);
    }
  });
};

export const initializeRuntimeSidecarProjectSessions = async (projectId: string) => {
  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return false;
  }

  ensureRuntimeEventSubscription();
  if (initializedProjects.has(projectId)) {
    return true;
  }

  const summaries = await client.listSessions(projectId);
  const snapshots = await Promise.all(summaries.map((session) => client.openSession(session.id)));
  snapshots.forEach((snapshot) => {
    applyRuntimeSidecarSnapshot(snapshot);
  });

  const chatStore = useAIChatStore.getState();
  const projectState = chatStore.projects[projectId];
  if (!projectState?.activeSessionId && projectState?.sessions[0]) {
    chatStore.setActiveSession(projectId, projectState.sessions[0].id);
  }

  initializedProjects.add(projectId);
  return true;
};

export const createRuntimeSidecarSession = async (input: {
  projectId: string;
  providerId: AgentProviderId;
  title?: string;
}) => {
  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return null;
  }

  ensureRuntimeEventSubscription();
  const snapshot = await client.createSession({
    projectId: input.projectId,
    title: input.title,
    providerId: input.providerId,
  });
  applyRuntimeSidecarSnapshot(snapshot);
  useAIChatStore.getState().setActiveSession(input.projectId, snapshot.session.id);
  initializedProjects.add(input.projectId);
  return snapshot.session.id;
};

export const submitRuntimeSidecarTurn = async (input: {
  projectId: string;
  providerId: AgentProviderId;
  sessionId?: string | null;
  title?: string;
  prompt: string;
  runtimeConfig?: AIConfigEntry | null;
}) => {
  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return false;
  }

  ensureRuntimeEventSubscription();
  let sessionId = input.sessionId || null;
  if (!sessionId) {
    sessionId = await createRuntimeSidecarSession({
      projectId: input.projectId,
      providerId: input.providerId,
      title: input.title,
    });
  }

  if (!sessionId) {
    return false;
  }

  await client.submitTurn({
    sessionId,
    prompt: input.prompt,
    providerId: input.providerId,
    runtimeConfig: mapRuntimeConfig(input.runtimeConfig),
  });
  return true;
};
