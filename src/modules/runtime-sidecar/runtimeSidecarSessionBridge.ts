import type {
  RuntimeMcpServerRecord,
  RuntimeMcpToolCallRecord,
  RuntimeApprovalResolveInput,
  RuntimeApprovalEventRecord,
  RuntimeBackgroundTaskRecord,
  RuntimeCheckpointRecord,
  RuntimeConversationHistoryMessage,
  RuntimeEventEnvelope,
  RuntimeMessageRecord,
  RuntimeQuestionEventRecord,
  RuntimeQuestionAnswerInput,
  RuntimeReferenceFileRecord,
  RuntimeSessionSnapshot,
  RuntimeTeamRunRecord,
  RuntimeToolCallRecord,
} from '@goodnight/runtime-protocol';
import type { AIConfigEntry } from '../ai/store/aiConfigState.ts';
import { useRuntimeMcpStore } from '../ai/runtime/mcp/runtimeMcpStore.ts';
import { useApprovalStore } from '../ai/runtime/approval/approvalStore.ts';
import type { ApprovalRecord } from '../ai/runtime/approval/approvalTypes.ts';
import type {
  AgentReplayEvent,
  AgentBackgroundTaskRecord,
  AgentTurnCheckpointDiff,
  AgentTurnCheckpointRecord,
  AgentTurnRewindResult,
  AgentProviderId,
  AgentThreadRecord,
} from '../ai/runtime/agentRuntimeTypes.ts';
import { useAgentRuntimeStore } from '../ai/runtime/agentRuntimeStore.ts';
import type { RuntimeToolStep } from '../ai/runtime/agent-kernel/agentKernelTypes.ts';
import type { AgentTeamRunRecord } from '../ai/runtime/teams/teamTypes.ts';
import {
  type AssistantTimelineEvent,
  createChatSession,
  createStoredChatMessage,
  type ChatSession,
  useAIChatStore,
} from '../ai/store/aiChatStore.ts';
import {
  ensureDesktopRuntimeSidecar,
  subscribeDesktopRuntimeEvents,
} from './desktopRuntimeSidecar.ts';
import {
  appendRuntimeReplayEvent as appendRuntimeReplayStoreEntry,
} from '../ai/runtime/replay/runtimeReplayClient.ts';

const initializedProjects = new Set<string>();
let runtimeEventsSubscribed = false;

const toProviderId = (providerId?: string | null): AgentProviderId => {
  if (providerId === 'claude' || providerId === 'codex' || providerId === 'team') {
    return providerId;
  }

  return 'built-in';
};

type RuntimeAssistantMessageRecord = RuntimeMessageRecord & {
  timeline?: AssistantTimelineEvent[];
};

const getAssistantTimeline = (message: RuntimeMessageRecord) =>
  Array.isArray((message as RuntimeAssistantMessageRecord).timeline)
    ? ((message as RuntimeAssistantMessageRecord).timeline as AssistantTimelineEvent[])
    : [];

const mapRuntimeMessage = (message: RuntimeMessageRecord) => {
  if (message.role === 'assistant') {
    const messageTimeline = getAssistantTimeline(message);

    return {
      ...createStoredChatMessage('assistant', message.content, 'default', {
        ...(messageTimeline.length > 0 ? { timeline: messageTimeline } : {}),
        runId: message.id,
      }),
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

const mapRuntimeToolCall = (toolCall: RuntimeToolCallRecord): RuntimeToolStep => ({
  id: toolCall.id,
  parentToolCallId: toolCall.parentToolCallId ?? null,
  name: toolCall.name,
  input: toolCall.input,
  status: toolCall.status,
  resultPreview: toolCall.resultPreview,
  resultContent: toolCall.resultContent,
  fileChanges: toolCall.fileChanges,
});

const mapRuntimeBackgroundTask = (
  task: RuntimeBackgroundTaskRecord,
): AgentBackgroundTaskRecord => ({
  id: task.id,
  threadId: task.sessionId,
  runKind: task.runKind,
  title: task.title,
  status: task.status,
  summary: task.summary,
  payloadJson: task.payloadJson,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});

const mapRuntimeReplayEvent = (event: {
  id: string;
  sessionId: string;
  eventType: string;
  payload: string;
  createdAt: number;
}): AgentReplayEvent => ({
  id: event.id,
  threadId: event.sessionId,
  eventType: event.eventType,
  payload: event.payload,
  createdAt: event.createdAt,
});

const mapRuntimeCheckpoint = (checkpoint: {
  id: string;
  sessionId: string;
  runId: string;
  messageId: string | null;
  summary: string;
  filesChanged: AgentTurnCheckpointRecord['filesChanged'];
  insertions: number;
  deletions: number;
  createdAt: number;
  updatedAt: number;
}): AgentTurnCheckpointRecord => ({
  id: checkpoint.id,
  threadId: checkpoint.sessionId,
  runId: checkpoint.runId,
  messageId: checkpoint.messageId,
  summary: checkpoint.summary,
  filesChanged: checkpoint.filesChanged,
  insertions: checkpoint.insertions,
  deletions: checkpoint.deletions,
  createdAt: checkpoint.createdAt,
  updatedAt: checkpoint.updatedAt,
});

const mapRuntimeTeamRun = (
  teamRun: RuntimeTeamRunRecord,
): AgentTeamRunRecord => ({
  id: teamRun.id,
  threadId: teamRun.sessionId,
  turnId: teamRun.turnId,
  providerId: 'team',
  summary: teamRun.summary,
  strategy: teamRun.strategy,
  status: teamRun.status,
  phases: teamRun.phases.map((phase) => ({
    id: phase.id as AgentTeamRunRecord['phases'][number]['id'],
    title: phase.title,
    summary: phase.summary,
    goal: phase.goal,
    status: phase.status,
    startedAt: phase.startedAt,
    completedAt: phase.completedAt,
    taskIds: [...phase.taskIds],
  })),
  members: teamRun.members.map((member) => ({
    id: member.id,
    threadId: member.sessionId,
    parentTurnId: member.parentTurnId,
    taskId: member.taskId,
    phaseId: member.phaseId as AgentTeamRunRecord['members'][number]['phaseId'],
    role: member.role as AgentTeamRunRecord['members'][number]['role'],
    agentId: member.agentId as AgentTeamRunRecord['members'][number]['agentId'],
    title: member.title,
    prompt: member.prompt,
    status: member.status,
    startedAt: member.startedAt,
    completedAt: member.completedAt,
    result: member.result,
    error: member.error,
    dependsOn: [...member.dependsOn],
    changedPaths: [...member.changedPaths],
  })),
  finalSummary: teamRun.finalSummary,
  changedPaths: [...teamRun.changedPaths],
  createdAt: teamRun.createdAt,
  updatedAt: teamRun.updatedAt,
});

const deriveToolCallsFromMessages = (
  messages: RuntimeMessageRecord[],
): RuntimeToolStep[] => {
  const toolCalls = new Map<string, RuntimeToolStep>();

  messages.forEach((message) => {
    getAssistantTimeline(message).forEach((event) => {
      if (event.kind === 'tool_use') {
        toolCalls.set(event.toolCallId, {
          id: event.toolCallId,
          parentToolCallId: event.parentToolCallId ?? null,
          name: event.toolName,
          input: event.input,
          status: event.status,
          resultPreview: toolCalls.get(event.toolCallId)?.resultPreview || '',
          resultContent: toolCalls.get(event.toolCallId)?.resultContent,
          fileChanges: toolCalls.get(event.toolCallId)?.fileChanges,
        });
        return;
      }

      if (event.kind === 'tool_result') {
        const previous = toolCalls.get(event.toolCallId);
        toolCalls.set(event.toolCallId, {
          id: event.toolCallId,
          parentToolCallId: event.parentToolCallId ?? null,
          name: event.toolName,
          input: previous?.input || {},
          status: event.status,
          resultPreview: event.output,
          resultContent: event.output,
          fileChanges: event.fileChanges,
        });
      }
    });
  });

  return [...toolCalls.values()].sort((left, right) => left.id.localeCompare(right.id));
};

const deriveApprovalsFromMessages = (
  threadId: string,
  messages: RuntimeMessageRecord[],
): ApprovalRecord[] =>
  messages.flatMap((message) =>
    getAssistantTimeline(message).flatMap((event) =>
      event.kind === 'approval'
        ? [
            {
              id: event.approvalId,
              threadId,
              actionType: event.actionType,
              riskLevel: event.riskLevel,
              summary: event.summary,
              status: event.status,
              createdAt: event.createdAt,
              messageId: message.id,
            } satisfies ApprovalRecord,
          ]
        : [],
    ),
  );

const deriveLiveState = (messages: RuntimeMessageRecord[]) => {
  const latestAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant');
  const timeline = latestAssistantMessage ? getAssistantTimeline(latestAssistantMessage) : [];
  const pendingApprovalEvents = timeline.filter(
    (event): event is Extract<AssistantTimelineEvent, { kind: 'approval' }> =>
      event.kind === 'approval' && event.status === 'pending',
  );
  const pendingQuestionEvents = timeline.filter(
    (event): event is Extract<AssistantTimelineEvent, { kind: 'question' }> =>
      event.kind === 'question' && event.payload.status === 'pending',
  );
  const runningToolEvent = [...timeline]
    .reverse()
    .find(
      (event): event is Extract<AssistantTimelineEvent, { kind: 'tool_use' }> =>
        event.kind === 'tool_use' && event.status === 'running',
    );
  const activeReasoning = [...timeline]
    .reverse()
    .find(
      (event): event is Extract<AssistantTimelineEvent, { kind: 'reasoning' }> => event.kind === 'reasoning',
    );

  return {
    pendingApprovalSummary: pendingApprovalEvents[0]?.summary || null,
    pendingPermissionCount: pendingApprovalEvents.length,
    pendingQuestionSummary: pendingQuestionEvents[0]?.payload.questions[0]?.question || null,
    activeToolName: runningToolEvent?.toolName || null,
    activeThinking: activeReasoning?.status === 'streaming',
    statusVerb: pendingQuestionEvents.length > 0
      ? 'Waiting for input'
      : pendingApprovalEvents.length > 0
        ? 'Waiting for approval'
        : runningToolEvent?.toolName
          ? `Running ${runningToolEvent.toolName}`
          : activeReasoning?.status === 'streaming'
            ? 'Reasoning'
            : '',
  };
};

const ensureRuntimeThreadProjection = (projectId: string, sessionId: string) => {
  const runtimeStore = useAgentRuntimeStore.getState();
  const thread = runtimeStore.threadsByProject[projectId]?.find((entry) => entry.id === sessionId);
  if (thread) {
    return;
  }

  runtimeStore.createThread(projectId, {
    id: sessionId,
    providerId: 'built-in',
    title: '新对话',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
};

const resolvePassiveStatusVerb = (state: {
  pendingQuestionSummary: string | null;
  pendingPermissionCount: number;
  activeThinking: boolean;
  activeToolName: string | null;
}) => {
  if (state.pendingQuestionSummary) {
    return 'Waiting for input';
  }

  if (state.pendingPermissionCount > 0) {
    return 'Waiting for approval';
  }

  if (state.activeToolName) {
    return `Running ${state.activeToolName}`;
  }

  if (state.activeThinking) {
    return 'Reasoning';
  }

  return '';
};

const syncRuntimeSidecarSessionProjections = (projectId: string, sessionId: string, messages: RuntimeMessageRecord[]) => {
  const runtimeStore = useAgentRuntimeStore.getState();
  runtimeStore.setThreadToolCalls(sessionId, deriveToolCallsFromMessages(messages));
  runtimeStore.patchLiveState(sessionId, (state) => ({
    ...state,
    connectionState: 'connected',
    ...deriveLiveState(messages),
  }));
  useApprovalStore.getState().setThreadApprovals(sessionId, deriveApprovalsFromMessages(sessionId, messages));
  ensureRuntimeThreadProjection(projectId, sessionId);
};

const findProjectSessionByRuntimeId = (sessionId: string) => {
  const chatStore = useAIChatStore.getState();
  for (const [projectId, project] of Object.entries(chatStore.projects)) {
    const session = project.sessions.find((entry) => entry.id === sessionId || entry.runtimeThreadId === sessionId);
    if (session) {
      return { projectId, session };
    }
  }

  return null;
};

const upsertRuntimeToolCallProjection = (threadId: string, toolCall: RuntimeToolCallRecord) => {
  const runtimeStore = useAgentRuntimeStore.getState();
  runtimeStore.setThreadToolCalls(
    threadId,
    [
      ...(runtimeStore.toolCallsByThread[threadId] || []).filter((entry) => entry.id !== toolCall.id),
      mapRuntimeToolCall(toolCall),
    ].sort((left, right) => left.id.localeCompare(right.id)),
  );
};

const mapRuntimeMcpServerRecord = (server: RuntimeMcpServerRecord) => ({
  ...server,
  toolNames: [...server.toolNames],
  args: server.args ? [...server.args] : undefined,
  env: { ...server.env },
  headers: { ...server.headers },
  oauth: server.oauth ? { ...server.oauth } : null,
  tools: server.tools ? server.tools.map((tool) => ({ ...tool })) : undefined,
});

const mapRuntimeMcpToolCallRecord = (toolCall: RuntimeMcpToolCallRecord) => ({
  ...toolCall,
});

const setRuntimeSidecarMcpServers = (servers: RuntimeMcpServerRecord[]) => {
  useRuntimeMcpStore.getState().setServers(servers.map(mapRuntimeMcpServerRecord));
};

const setRuntimeSidecarMcpToolCalls = (
  threadId: string,
  toolCalls: RuntimeMcpToolCallRecord[],
) => {
  useRuntimeMcpStore.getState().setToolCalls(threadId, toolCalls.map(mapRuntimeMcpToolCallRecord));
};

const applyRuntimeSidecarTurnStartedEvent = (sessionId: string, emittedAt: number) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  const runtimeStore = useAgentRuntimeStore.getState();
  runtimeStore.startRun(sessionId);
  runtimeStore.patchLiveState(sessionId, (state) => ({
    ...state,
    connectionState: 'connected',
    startedAt: state.startedAt ?? emittedAt,
    activeThinking: true,
    activeToolName: null,
    streamingText: '',
    streamingToolInput: '',
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
    },
    statusVerb: resolvePassiveStatusVerb({
      ...state,
      activeThinking: true,
      activeToolName: null,
    }),
  }));
};

const applyRuntimeSidecarReasoningEvent = (sessionId: string) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  useAgentRuntimeStore.getState().patchLiveState(sessionId, (state) => ({
    ...state,
    connectionState: 'connected',
    activeThinking: true,
    statusVerb: resolvePassiveStatusVerb({
      ...state,
      activeThinking: true,
    }),
  }));
};

const applyRuntimeSidecarTurnDeltaEvent = (sessionId: string, delta: string) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  const runtimeStore = useAgentRuntimeStore.getState();
  runtimeStore.appendStreamDelta(sessionId, delta);
  runtimeStore.patchLiveState(sessionId, (state) => ({
    ...state,
    connectionState: 'connected',
    streamingText: `${state.streamingText}${delta}`,
  }));
};

const applyRuntimeSidecarTurnUsageEvent = (
  sessionId: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens?: number;
  },
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  useAgentRuntimeStore.getState().patchLiveState(sessionId, (state) => ({
    ...state,
    connectionState: 'connected',
    tokenUsage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    },
  }));
};

const applyRuntimeSidecarToolStartedEvent = (sessionId: string, toolCall: RuntimeToolCallRecord) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  upsertRuntimeToolCallProjection(sessionId, toolCall);
  useAgentRuntimeStore.getState().patchLiveState(sessionId, (state) => ({
    ...state,
    connectionState: 'connected',
    activeThinking: false,
    activeToolName: toolCall.name,
    streamingToolInput: JSON.stringify(toolCall.input, null, 2),
    statusVerb: `Running ${toolCall.name}`,
  }));
};

const applyRuntimeSidecarToolFinishedEvent = (sessionId: string, toolCall: RuntimeToolCallRecord) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  upsertRuntimeToolCallProjection(sessionId, toolCall);
  useAgentRuntimeStore.getState().patchLiveState(sessionId, (state) => {
    const nextActiveToolName = state.activeToolName === toolCall.name ? null : state.activeToolName;
    return {
      ...state,
      activeToolName: nextActiveToolName,
      streamingToolInput: nextActiveToolName ? state.streamingToolInput : '',
      statusVerb: resolvePassiveStatusVerb({
        ...state,
        activeThinking: false,
        activeToolName: nextActiveToolName,
      }),
    };
  });
};

const applyRuntimeSidecarToolUpdatedEvent = (sessionId: string, toolCall: RuntimeToolCallRecord) => {
  if (toolCall.status === 'running') {
    applyRuntimeSidecarToolStartedEvent(sessionId, toolCall);
    return;
  }

  applyRuntimeSidecarToolFinishedEvent(sessionId, toolCall);
};

const applyRuntimeSidecarApprovalRequestedEvent = (
  sessionId: string,
  messageId: string,
  approval: RuntimeApprovalEventRecord,
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  useApprovalStore.getState().enqueueApproval({
    id: approval.approvalId,
    threadId: sessionId,
    actionType: approval.actionType,
    riskLevel: approval.riskLevel,
    summary: approval.summary,
    status: approval.status,
    createdAt: approval.createdAt,
    messageId,
  });
  const pendingApprovals = useApprovalStore
    .getState()
    .approvalsByThread[sessionId]?.filter((entry) => entry.status === 'pending') || [];
  useAgentRuntimeStore.getState().patchLiveState(sessionId, (state) => ({
    ...state,
    pendingApprovalSummary: pendingApprovals[0]?.summary || approval.summary,
    pendingPermissionCount: pendingApprovals.length,
    statusVerb: 'Waiting for approval',
  }));
};

const applyRuntimeSidecarApprovalResolvedEvent = (
  sessionId: string,
  approval: RuntimeApprovalEventRecord,
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  useApprovalStore.getState().resolveApproval(approval.approvalId, approval.status);
  const pendingApprovals = useApprovalStore
    .getState()
    .approvalsByThread[sessionId]?.filter((entry) => entry.status === 'pending') || [];
  useAgentRuntimeStore.getState().patchLiveState(sessionId, (state) => ({
    ...state,
    pendingPermissionCount: pendingApprovals.length,
    pendingApprovalSummary: pendingApprovals[0]?.summary || null,
    statusVerb: resolvePassiveStatusVerb({
      ...state,
      pendingPermissionCount: pendingApprovals.length,
      pendingQuestionSummary: state.pendingQuestionSummary,
      activeThinking: state.activeThinking,
      activeToolName: state.activeToolName,
    }),
  }));
};

const applyRuntimeSidecarQuestionRequestedEvent = (
  sessionId: string,
  question: RuntimeQuestionEventRecord,
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  useAgentRuntimeStore.getState().patchLiveState(sessionId, (state) => ({
    ...state,
    pendingQuestionSummary: question.payload.questions[0]?.question || null,
    statusVerb: 'Waiting for input',
  }));
};

const applyRuntimeSidecarQuestionAnsweredEvent = (
  sessionId: string,
  question: RuntimeQuestionEventRecord,
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  useAgentRuntimeStore.getState().patchLiveState(sessionId, (state) => {
    const nextPendingQuestionSummary =
      state.pendingQuestionSummary === question.payload.questions[0]?.question
        ? null
        : state.pendingQuestionSummary;
    return {
      ...state,
      pendingQuestionSummary: nextPendingQuestionSummary,
      statusVerb: resolvePassiveStatusVerb({
        ...state,
        pendingQuestionSummary: nextPendingQuestionSummary,
      }),
    };
  });
};

const applyRuntimeSidecarCheckpointSavedEvent = (
  sessionId: string,
  _checkpoint: RuntimeCheckpointRecord,
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
};

const applyRuntimeSidecarBackgroundTaskUpdatedEvent = (
  sessionId: string,
  task: RuntimeBackgroundTaskRecord,
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  useAgentRuntimeStore.getState().upsertBackgroundTask(sessionId, mapRuntimeBackgroundTask(task));
};

const applyRuntimeSidecarTeamRunUpdatedEvent = (
  sessionId: string,
  teamRun: RuntimeTeamRunRecord,
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  useAIChatStore.getState().updateMessage(
    located.projectId,
    located.session.id,
    teamRun.turnId,
    (message) => ({
      ...message,
      ...(message.role === 'assistant' ? { teamRun: mapRuntimeTeamRun(teamRun) } : {}),
    }),
  );
  useAgentRuntimeStore.getState().upsertTeamRun(sessionId, mapRuntimeTeamRun(teamRun));
};

const applyRuntimeSidecarTurnCompletedEvent = (sessionId: string) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  const runtimeStore = useAgentRuntimeStore.getState();
  runtimeStore.finishRun(sessionId);
  runtimeStore.patchLiveState(sessionId, (state) => ({
    ...state,
    activeThinking: false,
    activeToolName: null,
    streamingToolInput: '',
    streamingText: '',
    startedAt: null,
    statusVerb: resolvePassiveStatusVerb({
      ...state,
      activeThinking: false,
      activeToolName: null,
    }),
  }));
};

const applyRuntimeSidecarTurnFailedEvent = (sessionId: string) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  const runtimeStore = useAgentRuntimeStore.getState();
  runtimeStore.failRun(sessionId, 'Runtime turn failed.');
  runtimeStore.patchLiveState(sessionId, (state) => ({
    ...state,
    activeThinking: false,
    activeToolName: null,
    streamingToolInput: '',
    streamingText: '',
    startedAt: null,
    statusVerb: resolvePassiveStatusVerb({
      ...state,
      activeThinking: false,
      activeToolName: null,
    }),
  }));
};

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
  syncRuntimeSidecarSessionProjections(snapshot.session.projectId, snapshot.session.id, snapshot.messages);
};

const applyRuntimeSidecarMessageEvent = (sessionId: string, message: RuntimeMessageRecord) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  const mappedMessage = mapRuntimeMessage(message);
  const chatStore = useAIChatStore.getState();
  const existingMessage = located.session.messages.find((entry) => entry.id === mappedMessage.id);
  if (existingMessage) {
    chatStore.updateMessage(located.projectId, located.session.id, mappedMessage.id, () => mappedMessage);
  } else {
    chatStore.appendMessage(located.projectId, located.session.id, mappedMessage);
  }

};

const ensureRuntimeEventSubscription = () => {
  if (runtimeEventsSubscribed) {
    return;
  }

  runtimeEventsSubscribed = true;
  subscribeDesktopRuntimeEvents((event: RuntimeEventEnvelope) => {
    if (event.type === 'session.snapshot') {
      applyRuntimeSidecarSnapshot(event.payload);
      return;
    }

    if (event.type === 'message.delta' || event.type === 'turn.finished') {
      applyRuntimeSidecarMessageEvent(event.payload.sessionId, event.payload.message);
      return;
    }

    if (event.type === 'turn.delta') {
      applyRuntimeSidecarTurnDeltaEvent(event.payload.sessionId, event.payload.delta);
      return;
    }

    if (event.type === 'turn.usage') {
      applyRuntimeSidecarTurnUsageEvent(event.payload.sessionId, event.payload.usage);
      return;
    }

    if (event.type === 'turn.started') {
      applyRuntimeSidecarTurnStartedEvent(event.payload.sessionId, event.emittedAt);
      return;
    }

    if (event.type === 'turn.reasoning') {
      applyRuntimeSidecarReasoningEvent(event.payload.sessionId);
      return;
    }

    if (event.type === 'tool.started') {
      applyRuntimeSidecarToolStartedEvent(event.payload.sessionId, event.payload.toolCall);
      return;
    }

    if (event.type === 'tool.finished') {
      applyRuntimeSidecarToolFinishedEvent(event.payload.sessionId, event.payload.toolCall);
      return;
    }

    if (event.type === 'tool.updated') {
      applyRuntimeSidecarToolUpdatedEvent(event.payload.sessionId, event.payload.toolCall);
      return;
    }

    if (event.type === 'approval.requested') {
      applyRuntimeSidecarApprovalRequestedEvent(
        event.payload.sessionId,
        event.payload.messageId,
        event.payload.approval,
      );
      return;
    }

    if (event.type === 'approval.resolved') {
      applyRuntimeSidecarApprovalResolvedEvent(event.payload.sessionId, event.payload.approval);
      return;
    }

    if (event.type === 'question.requested') {
      applyRuntimeSidecarQuestionRequestedEvent(event.payload.sessionId, event.payload.question);
      return;
    }

    if (event.type === 'question.answered') {
      applyRuntimeSidecarQuestionAnsweredEvent(event.payload.sessionId, event.payload.question);
      return;
    }

    if (event.type === 'turn.completed') {
      applyRuntimeSidecarTurnCompletedEvent(event.payload.sessionId);
      return;
    }

    if (event.type === 'turn.failed') {
      applyRuntimeSidecarTurnFailedEvent(event.payload.sessionId);
      return;
    }

    if (event.type === 'checkpoint.saved') {
      applyRuntimeSidecarCheckpointSavedEvent(event.payload.sessionId, event.payload.checkpoint);
      return;
    }

    if (event.type === 'background_task.updated') {
      applyRuntimeSidecarBackgroundTaskUpdatedEvent(event.payload.sessionId, event.payload.task);
      return;
    }

    if (event.type === 'team_run.updated') {
      applyRuntimeSidecarTeamRunUpdatedEvent(event.payload.sessionId, event.payload.teamRun);
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
  const [servers, sessionToolCalls] = await Promise.all([
    client.listMcpServers(),
    Promise.all(
      summaries.map(async (session) => ({
        sessionId: session.id,
        toolCalls: await client.listMcpToolCalls(session.id),
      })),
    ),
  ]);
  const sessionBackgroundTasks = await Promise.all(
    summaries.map(async (session) => ({
      sessionId: session.id,
      tasks: await client.listBackgroundTasks(session.id),
    })),
  );
  snapshots.forEach((snapshot) => {
    applyRuntimeSidecarSnapshot(snapshot);
  });
  setRuntimeSidecarMcpServers(servers);
  sessionToolCalls.forEach(({ sessionId, toolCalls }) => {
    setRuntimeSidecarMcpToolCalls(sessionId, toolCalls);
  });
  sessionBackgroundTasks.forEach(({ sessionId, tasks }) => {
    const runtimeStore = useAgentRuntimeStore.getState();
    runtimeStore.setThreadBackgroundTasks(sessionId, tasks.map(mapRuntimeBackgroundTask));
    tasks
      .filter((task) => task.runKind === 'team')
      .forEach((task) => {
        try {
          runtimeStore.upsertTeamRun(sessionId, mapRuntimeTeamRun(JSON.parse(task.payloadJson)));
        } catch {
          // Ignore malformed team payloads from older stores.
        }
      });
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
  setRuntimeSidecarMcpToolCalls(snapshot.session.id, []);
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
  projectName?: string;
  projectRoot?: string;
  permissionMode?: 'ask' | 'plan' | 'auto' | 'bypass';
  conversationHistory?: RuntimeConversationHistoryMessage[];
  referenceFiles?: RuntimeReferenceFileRecord[];
  contextLabels?: string[];
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
    projectName: input.projectName,
    projectRoot: input.projectRoot,
    permissionMode: input.permissionMode,
    conversationHistory: input.conversationHistory,
    referenceFiles: input.referenceFiles,
    contextLabels: input.contextLabels,
    runtimeConfig: mapRuntimeConfig(input.runtimeConfig),
  });
  return true;
};

export const answerRuntimeSidecarQuestion = async (input: RuntimeQuestionAnswerInput) => {
  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return false;
  }

  await client.answerQuestion(input);
  return true;
};

export const resolveRuntimeSidecarApproval = async (input: RuntimeApprovalResolveInput) => {
  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return false;
  }

  await client.resolveApproval(input);
  return true;
};

export const initializeRuntimeSidecarMcpServers = async () => {
  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return false;
  }

  ensureRuntimeEventSubscription();
  setRuntimeSidecarMcpServers(await client.listMcpServers());
  return true;
};

export const initializeRuntimeSidecarMcpToolCalls = async (threadId: string) => {
  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return false;
  }

  ensureRuntimeEventSubscription();
  setRuntimeSidecarMcpToolCalls(threadId, await client.listMcpToolCalls(threadId));
  return true;
};

export const initializeRuntimeSidecarBackgroundTasks = async (threadId: string) => {
  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return [];
  }

  ensureRuntimeEventSubscription();
  const tasks = await client.listBackgroundTasks(threadId);
  const runtimeStore = useAgentRuntimeStore.getState();
  runtimeStore.setThreadBackgroundTasks(threadId, tasks.map(mapRuntimeBackgroundTask));
  tasks
    .filter((task) => task.runKind === 'team')
    .forEach((task) => {
      try {
        runtimeStore.upsertTeamRun(threadId, mapRuntimeTeamRun(JSON.parse(task.payloadJson)));
      } catch {
        // Ignore malformed team payloads from older stores.
      }
    });
  return tasks.map(mapRuntimeBackgroundTask);
};

export const initializeRuntimeSidecarReplayHistory = async (threadId: string) => {
  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return [];
  }

  ensureRuntimeEventSubscription();
  const events = await client.listReplayEvents(threadId);
  const mappedEvents = events.map(mapRuntimeReplayEvent);
  useAgentRuntimeStore.getState().setReplayEvents(threadId, mappedEvents);
  return mappedEvents;
};

export const listRuntimeSidecarCheckpoints = async (threadId: string) => {
  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return [];
  }

  ensureRuntimeEventSubscription();
  return (await client.listCheckpoints(threadId)).map(mapRuntimeCheckpoint);
};

export const getRuntimeSidecarCheckpointDiff = async (input: {
  threadId: string;
  runId: string;
  path: string;
}): Promise<AgentTurnCheckpointDiff | null> => {
  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return null;
  }

  ensureRuntimeEventSubscription();
  const diff = await client.getCheckpointDiff({
    sessionId: input.threadId,
    runId: input.runId,
    path: input.path,
  });
  return {
    checkpointId: diff.checkpointId,
    threadId: diff.sessionId,
    runId: diff.runId,
    path: diff.path,
    changeType: diff.changeType,
    beforeContent: diff.beforeContent,
    afterContent: diff.afterContent,
    diff: diff.diff,
    insertions: diff.insertions,
    deletions: diff.deletions,
    createdAt: diff.createdAt,
  };
};

export const rewindRuntimeSidecarCheckpoint = async (input: {
  threadId: string;
  runId: string;
}): Promise<AgentTurnRewindResult | null> => {
  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return null;
  }

  ensureRuntimeEventSubscription();
  const checkpoints = await client.listCheckpoints(input.threadId);
  const checkpoint = checkpoints.find((entry) => entry.runId === input.runId) || null;
  if (!checkpoint) {
    throw new Error(`Checkpoint not found for run ${input.runId}`);
  }

  const result = await client.rewindCheckpoint({
    sessionId: input.threadId,
    checkpointId: checkpoint.id,
  });
  return {
    threadId: result.sessionId,
    runId: result.runId,
    restoredPaths: result.restoredPaths,
    removedRunIds: result.removedRunIds,
    checkpointCount: result.checkpointCount,
    rewoundAt: result.rewoundAt,
  };
};

export const upsertRuntimeSidecarMcpServer = async (input: RuntimeMcpServerRecord) => {
  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return null;
  }

  ensureRuntimeEventSubscription();
  const server = await client.upsertMcpServer(input);
  useRuntimeMcpStore.getState().upsertServer(mapRuntimeMcpServerRecord(server));
  return server;
};

export const deleteRuntimeSidecarMcpServer = async (id: string) => {
  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return null;
  }

  ensureRuntimeEventSubscription();
  const result = await client.deleteMcpServer(id);
  if (result.deleted) {
    useRuntimeMcpStore.getState().removeServer(id);
  }
  return result;
};

export const invokeRuntimeSidecarMcpTool = async (input: {
  threadId: string;
  serverId: string;
  toolName: string;
  argumentsText?: string;
}) => {
  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return null;
  }

  ensureRuntimeEventSubscription();
  const toolCall = await client.invokeMcpTool(input);
  useRuntimeMcpStore.getState().appendToolCall(input.threadId, mapRuntimeMcpToolCallRecord(toolCall));
  return toolCall;
};

export const appendRuntimeSidecarReplayHistoryEntry = (input: {
  threadId: string;
  eventType: string;
  payload: string;
}) => appendRuntimeReplayStoreEntry(input);
