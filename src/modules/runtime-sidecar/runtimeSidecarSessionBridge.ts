// 文件作用：会话桥接层，位于runtime sidecar 桥接层。
// 所在链路：负责把 sidecar 事件、快照与前端多个 store 接起来。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import type {
// 这个 bridge 是前端聊天状态与 runtime sidecar 之间的总接线层。
// 它负责把 sidecar snapshot/event 映射到 chat store、runtime store、approval store，并暴露会话动作入口。
// 如果你在排查“sidecar 数据是怎么落到前端各个 store 的”，先看这里。
  CanonicalEvent,
  RuntimeAssistantTimelineEvent,
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
  RuntimeReasoningEventRecord,
  RuntimeQuestionAnswerInput,
  RuntimeReferenceFileRecord,
  RuntimeSessionDeleteResult,
  RuntimeSessionSnapshot,
  RuntimeTeamRunRecord,
  RuntimeToolCallRecord,
  RuntimeTurnDeltaTrace,
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
import type { AgentRuntimeLiveState } from '../ai/runtime/agentRuntimeStore.ts';
import type { RuntimeToolStep } from '../ai/runtime/agent-kernel/agentKernelTypes.ts';
import type { AgentTeamRunRecord } from '../ai/runtime/teams/teamTypes.ts';
import {
  createStreamingLatencyTrace,
  recordProviderChunk,
} from '../ai/runtime/streamingLatencyTrace.ts';
import { reconcileRuntimeThreadsWithSessions } from '../ai/runtime/conversation/runtimeConversationGateway.ts';
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
import {
  buildCanonicalEventsFromRuntimeSnapshot,
  buildRuntimeSidecarToolCompletedEvent,
  createRuntimeSidecarCanonicalEvent,
} from './runtimeSidecarCanonical.ts';
import {
  createRuntimeSidecarDeltaCoalescer,
} from './runtimeSidecarStreamingCoalescer.ts';
import {
  resolveRuntimeSidecarSnapshotMessageDelta,
  resolveRuntimeSidecarSnapshotReasoningDelta,
} from './runtimeSidecarMessageDelta.ts';

// runtimeSidecarSessionBridge 是前端和 node runtime sidecar 之间的总桥接层：
// - 把 sidecar snapshot / event 映射成 chat store、runtime store、approval store 可消费的数据。
// - 对外暴露“初始化会话、提交 turn、回答问题、处理审批、拉取检查点”等动作入口。
// - 如果要追 AIChat 和 sidecar 的真实对接链路，这个文件通常是主干入口。
const initializedProjects = new Set<string>();
let runtimeEventsSubscribed = false;

const toProviderId = (providerId?: string | null): AgentProviderId => {
  if (providerId === 'claude' || providerId === 'codex' || providerId === 'team') {
    return providerId;
  }

  return 'built-in';
};

type RuntimeAssistantMessageRecord = RuntimeMessageRecord & {
  timeline?: RuntimeAssistantTimelineEvent[];
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
  // snapshot -> ChatSession 是最关键的一层映射：
  // 这里把 sidecar 的会话快照翻译成前端聊天页能直接消费的 session 结构。
  const providerId = toProviderId(snapshot.session.providerId);
  const baseSession = existingSession || createChatSession(snapshot.session.projectId, snapshot.session.title, providerId);
  const canonicalEvents = buildCanonicalEventsFromRuntimeSnapshot(snapshot);

  return {
    ...baseSession,
    id: snapshot.session.id,
    projectId: snapshot.session.projectId,
    title: snapshot.session.title,
    providerId,
    runtimeThreadId: snapshot.session.id,
    messages: snapshot.messages.map(mapRuntimeMessage),
    canonicalEvents,
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
  // sidecar 返回的工具调用有时散落在 assistant timeline 里，
  // 这里把 tool_use / tool_result 重新折叠成 runtime store 里的工具投影。
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
              resolvedAt: event.resolvedAt,
              messageId: message.id,
            } satisfies ApprovalRecord,
          ]
        : [],
    ),
  );

const deriveLiveState = (messages: RuntimeMessageRecord[]) => {
  // liveState 是从“最新 assistant message 的 timeline”里推出来的瞬时前端状态：
  // 当前是否在 thinking、是否有 pending approval/question、当前跑着哪个工具等都在这里归纳。
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

const createIdleRuntimeSidecarLiveState = (): AgentRuntimeLiveState => ({
  connectionState: 'disconnected',
  statusVerb: '',
  elapsedSeconds: 0,
  startedAt: null,
  activeToolName: null,
  streamingToolInput: '',
  pendingApprovalSummary: null,
  pendingQuestionSummary: null,
  activeThinking: false,
  streamingText: '',
  pendingPermissionCount: 0,
  tokenUsage: {
    inputTokens: 0,
    outputTokens: 0,
  },
  streamingLatencyTrace: null,
});

const areRuntimeSidecarLiveStatesEqual = (
  left: AgentRuntimeLiveState,
  right: AgentRuntimeLiveState,
) =>
  left.connectionState === right.connectionState
  && left.statusVerb === right.statusVerb
  && left.elapsedSeconds === right.elapsedSeconds
  && left.startedAt === right.startedAt
  && left.activeToolName === right.activeToolName
  && left.streamingToolInput === right.streamingToolInput
  && left.pendingApprovalSummary === right.pendingApprovalSummary
  && left.pendingQuestionSummary === right.pendingQuestionSummary
  && left.activeThinking === right.activeThinking
  && left.streamingText === right.streamingText
  && left.pendingPermissionCount === right.pendingPermissionCount
  && left.tokenUsage.inputTokens === right.tokenUsage.inputTokens
  && left.tokenUsage.outputTokens === right.tokenUsage.outputTokens
  && left.streamingLatencyTrace?.requestStartedAt === right.streamingLatencyTrace?.requestStartedAt
  && left.streamingLatencyTrace?.providerFirstChunkAt === right.streamingLatencyTrace?.providerFirstChunkAt
  && left.streamingLatencyTrace?.providerChunkAt === right.streamingLatencyTrace?.providerChunkAt
  && left.streamingLatencyTrace?.providerChunkIntervalMs === right.streamingLatencyTrace?.providerChunkIntervalMs
  && left.streamingLatencyTrace?.runtimeBroadcastAt === right.streamingLatencyTrace?.runtimeBroadcastAt
  && left.streamingLatencyTrace?.sidecarReceivedAt === right.streamingLatencyTrace?.sidecarReceivedAt
  && left.streamingLatencyTrace?.frontendStateFlushAt === right.streamingLatencyTrace?.frontendStateFlushAt
  && left.streamingLatencyTrace?.firstVisibleCharAt === right.streamingLatencyTrace?.firstVisibleCharAt
  && left.streamingLatencyTrace?.finalVisibleDoneAt === right.streamingLatencyTrace?.finalVisibleDoneAt
  && left.streamingLatencyTrace?.chunkIndex === right.streamingLatencyTrace?.chunkIndex
  && left.streamingLatencyTrace?.endToEndFirstVisibleMs === right.streamingLatencyTrace?.endToEndFirstVisibleMs
  && left.streamingLatencyTrace?.endToEndCompletedMs === right.streamingLatencyTrace?.endToEndCompletedMs;

const patchLiveStateIfChanged = (
  threadId: string,
  updater: (state: AgentRuntimeLiveState) => AgentRuntimeLiveState,
) => {
  const runtimeStore = useAgentRuntimeStore.getState();
  const current = runtimeStore.liveStateByThread[threadId] || createIdleRuntimeSidecarLiveState();
  const next = updater(current);

  if (next === current || areRuntimeSidecarLiveStatesEqual(current, next)) {
    return;
  }

  runtimeStore.patchLiveState(threadId, next);
};

const patchApprovalSummaryIfChanged = (threadId: string, summary: string | null, count: number) => {
  patchLiveStateIfChanged(threadId, (state) =>
    state.pendingApprovalSummary === summary && state.pendingPermissionCount === count
      ? state
      : {
          ...state,
          pendingApprovalSummary: summary,
          pendingPermissionCount: count,
          statusVerb: count > 0 ? 'Waiting for approval' : resolvePassiveStatusVerb(state),
        },
  );
};

const syncRuntimeSidecarSessionProjections = (projectId: string, sessionId: string, messages: RuntimeMessageRecord[]) => {
  const runtimeStore = useAgentRuntimeStore.getState();
  runtimeStore.setThreadToolCalls(sessionId, deriveToolCallsFromMessages(messages));
  patchLiveStateIfChanged(sessionId, (state) => ({
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

const ensureRuntimeAssistantMessage = (input: {
  sessionId: string;
  messageId: string;
  createdAt: number;
}) => {
  const located = findProjectSessionByRuntimeId(input.sessionId);
  if (!located) {
    return null;
  }

  const existingMessage = located.session.messages.find((message) => message.id === input.messageId);
  if (existingMessage) {
    return located;
  }

  const placeholderMessage = {
    ...createStoredChatMessage('assistant', '', 'default', {
      runId: input.messageId,
      timeline: [],
    }),
    id: input.messageId,
    createdAt: input.createdAt,
  };

  useAIChatStore.getState().appendMessage(located.projectId, located.session.id, placeholderMessage);
  return findProjectSessionByRuntimeId(input.sessionId);
};

const appendRuntimeSidecarCanonicalEvent = (
  sessionId: string,
  messageId: string,
  event: CanonicalEvent,
  createdAt: number,
) => {
  const located =
    ensureRuntimeAssistantMessage({
      sessionId,
      messageId,
      createdAt,
    }) || findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  useAIChatStore.getState().appendCanonicalEvent(located.projectId, located.session.id, event);
};

const commitRuntimeSidecarMessage = (
  sessionId: string,
  message: RuntimeMessageRecord,
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return null;
  }

  const mappedMessage = mapRuntimeMessage(message);
  const chatStore = useAIChatStore.getState();
  const existingMessage = located.session.messages.find((entry) => entry.id === mappedMessage.id);
  if (existingMessage) {
    chatStore.updateMessage(located.projectId, located.session.id, mappedMessage.id, () => mappedMessage);
  } else {
    chatStore.appendMessage(located.projectId, located.session.id, mappedMessage);
  }

  return {
    ...located,
    mappedMessage,
  };
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

const applyRuntimeSidecarTurnStartedEvent = (sessionId: string, messageId: string, emittedAt: number) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  ensureRuntimeAssistantMessage({ sessionId, messageId, createdAt: emittedAt });
  appendRuntimeSidecarCanonicalEvent(
    sessionId,
    messageId,
    createRuntimeSidecarCanonicalEvent({
      sessionId,
      providerId: located.session.providerId,
      runId: messageId,
      messageId,
      type: 'run.started',
      payload: {
        providerId: located.session.providerId,
        threadId: sessionId,
        mode: 'agent',
      },
      ts: emittedAt,
    }),
    emittedAt,
  );
  appendRuntimeSidecarCanonicalEvent(
    sessionId,
    messageId,
    createRuntimeSidecarCanonicalEvent({
      sessionId,
      providerId: located.session.providerId,
      runId: messageId,
      messageId,
      type: 'message.started',
      payload: { role: 'assistant', phase: 'final_answer' },
      ts: emittedAt,
    }),
    emittedAt,
  );
  const runtimeStore = useAgentRuntimeStore.getState();
  runtimeStore.startRun(sessionId);
  patchLiveStateIfChanged(sessionId, (state) => ({
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
    streamingLatencyTrace: createStreamingLatencyTrace(emittedAt),
    statusVerb: resolvePassiveStatusVerb({
      ...state,
      activeThinking: true,
      activeToolName: null,
    }),
  }));
};

const applyRuntimeSidecarReasoningEvent = (
  sessionId: string,
  messageId: string,
  reasoning: RuntimeReasoningEventRecord,
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  appendRuntimeSidecarCanonicalEvent(
    sessionId,
    messageId,
    createRuntimeSidecarCanonicalEvent({
      sessionId,
      providerId: located.session.providerId,
      runId: messageId,
      messageId,
      type: 'reasoning.started',
      payload: {},
      ts: reasoning.createdAt,
    }),
    reasoning.createdAt,
  );
  const textChunk = resolveRuntimeSidecarSnapshotReasoningDelta(
    located.session.canonicalEvents || [],
    messageId,
    reasoning.content,
  );
  if (textChunk) {
    appendRuntimeSidecarCanonicalEvent(
      sessionId,
      messageId,
      createRuntimeSidecarCanonicalEvent({
        sessionId,
        providerId: located.session.providerId,
        runId: messageId,
        messageId,
        type: 'reasoning.delta',
        payload: {
          textChunk,
        },
        ts: reasoning.createdAt,
      }),
      reasoning.createdAt,
    );
  }
  if (reasoning.status === 'completed') {
    appendRuntimeSidecarCanonicalEvent(
      sessionId,
      messageId,
      createRuntimeSidecarCanonicalEvent({
        sessionId,
        providerId: located.session.providerId,
        runId: messageId,
        messageId,
        type: 'reasoning.completed',
        payload: {
          finalText: reasoning.content,
        },
        ts: reasoning.createdAt,
      }),
      reasoning.createdAt,
    );
  }
  patchLiveStateIfChanged(sessionId, (state) => ({
    ...state,
    connectionState: 'connected',
    activeThinking: true,
    statusVerb: resolvePassiveStatusVerb({
      ...state,
      activeThinking: true,
    }),
  }));
};

const applyRuntimeSidecarTurnDeltaNow = (
  sessionId: string,
  _messageId: string,
  delta: string,
  emittedAt: number,
  trace?: RuntimeTurnDeltaTrace,
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  const runtimeStore = useAgentRuntimeStore.getState();
  runtimeStore.appendStreamDelta(sessionId, delta);
  patchLiveStateIfChanged(sessionId, (state) => ({
    ...state,
    connectionState: 'connected',
    streamingText: `${state.streamingText}${delta}`,
    streamingLatencyTrace: recordProviderChunk(state.streamingLatencyTrace, {
      requestStartedAt: trace?.requestStartedAt,
      providerFirstChunkAt: trace?.providerFirstChunkAt,
      providerChunkAt: trace?.providerChunkAt ?? emittedAt,
      runtimeBroadcastAt: emittedAt,
      sidecarReceivedAt: Date.now(),
      chunkIndex: trace?.chunkIndex,
    }),
  }));
};

const runtimeSidecarDeltaCoalescer = createRuntimeSidecarDeltaCoalescer({
  applyDelta: applyRuntimeSidecarTurnDeltaNow,
});

const applyRuntimeSidecarTurnDeltaEvent = (
  sessionId: string,
  messageId: string,
  delta: string,
  emittedAt: number,
  trace?: RuntimeTurnDeltaTrace,
) => {
  runtimeSidecarDeltaCoalescer.push(sessionId, messageId, delta, emittedAt, trace);
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
  patchLiveStateIfChanged(sessionId, (state) => ({
    ...state,
    connectionState: 'connected',
    tokenUsage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    },
  }));
};

const applyRuntimeSidecarToolStartedEvent = (
  sessionId: string,
  messageId: string,
  toolCall: RuntimeToolCallRecord,
  emittedAt: number,
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  appendRuntimeSidecarCanonicalEvent(
    sessionId,
    messageId,
    createRuntimeSidecarCanonicalEvent({
      sessionId,
      providerId: located.session.providerId,
      runId: messageId,
      messageId,
      type: 'tool.started',
      payload: {
        toolCallId: toolCall.id,
        parentToolCallId: toolCall.parentToolCallId ?? null,
        toolName: toolCall.name,
        input: toolCall.input,
        inputSummary: JSON.stringify(toolCall.input),
      },
      ts: emittedAt,
      correlationId: toolCall.id,
      source: { kind: 'tool', provider: located.session.providerId, name: toolCall.name },
    }),
    emittedAt,
  );
  upsertRuntimeToolCallProjection(sessionId, toolCall);
  patchLiveStateIfChanged(sessionId, (state) => ({
    ...state,
    connectionState: 'connected',
    activeThinking: false,
    activeToolName: toolCall.name,
    streamingToolInput: JSON.stringify(toolCall.input, null, 2),
    statusVerb: `Running ${toolCall.name}`,
  }));
};

const applyRuntimeSidecarToolFinishedEvent = (
  sessionId: string,
  messageId: string,
  toolCall: RuntimeToolCallRecord,
  emittedAt: number,
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  appendRuntimeSidecarCanonicalEvent(
    sessionId,
    messageId,
    buildRuntimeSidecarToolCompletedEvent({
      sessionId,
      providerId: located.session.providerId,
      runId: messageId,
      messageId,
      toolCall,
      ts: emittedAt,
    }),
    emittedAt,
  );
  upsertRuntimeToolCallProjection(sessionId, toolCall);
  patchLiveStateIfChanged(sessionId, (state) => {
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

const applyRuntimeSidecarToolUpdatedEvent = (
  sessionId: string,
  messageId: string,
  toolCall: RuntimeToolCallRecord,
  emittedAt: number,
) => {
  if (toolCall.status === 'running') {
    applyRuntimeSidecarToolStartedEvent(sessionId, messageId, toolCall, emittedAt);
    return;
  }

  applyRuntimeSidecarToolFinishedEvent(sessionId, messageId, toolCall, emittedAt);
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
  appendRuntimeSidecarCanonicalEvent(
    sessionId,
    messageId,
    createRuntimeSidecarCanonicalEvent({
      sessionId,
      providerId: located.session.providerId,
      runId: messageId,
      messageId,
      type: 'approval.requested',
      payload: {
        approvalId: approval.approvalId,
        toolCallId: approval.toolCallId ?? null,
        actionType: approval.actionType,
        riskLevel: approval.riskLevel,
        summary: approval.summary,
        display: approval.display,
      },
      ts: approval.createdAt,
      correlationId: approval.approvalId,
    }),
    approval.createdAt,
  );
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
  patchApprovalSummaryIfChanged(sessionId, pendingApprovals[0]?.summary || approval.summary, pendingApprovals.length);
};

const applyRuntimeSidecarApprovalResolvedEvent = (
  sessionId: string,
  messageId: string,
  approval: RuntimeApprovalEventRecord,
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  const resolvedAt = approval.resolvedAt ?? approval.createdAt;
  appendRuntimeSidecarCanonicalEvent(
    sessionId,
    messageId,
    createRuntimeSidecarCanonicalEvent({
      sessionId,
      providerId: located.session.providerId,
      runId: messageId,
      messageId,
      type: 'approval.resolved',
      payload: {
        approvalId: approval.approvalId,
        resolution: approval.status === 'approved' ? 'approved' : 'denied',
      },
      ts: resolvedAt,
      correlationId: approval.approvalId,
    }),
    resolvedAt,
  );
  useApprovalStore.getState().resolveApproval(approval.approvalId, approval.status, resolvedAt);
  const pendingApprovals = useApprovalStore
    .getState()
    .approvalsByThread[sessionId]?.filter((entry) => entry.status === 'pending') || [];
  patchLiveStateIfChanged(sessionId, (state) => ({
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
  messageId: string,
  question: RuntimeQuestionEventRecord,
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  appendRuntimeSidecarCanonicalEvent(
    sessionId,
    messageId,
    createRuntimeSidecarCanonicalEvent({
      sessionId,
      providerId: located.session.providerId,
      runId: messageId,
      messageId,
      type: 'question.requested',
      payload: {
        questionId: question.questionId,
        toolCallId: question.payload.toolCallId ?? null,
        questions: question.payload.questions.map((item, index) => ({
          id: `${question.questionId}_${index}`,
          header: item.header,
          question: item.question,
          options: item.options,
        })),
      },
      ts: question.createdAt,
      correlationId: question.questionId,
    }),
    question.createdAt,
  );
  patchLiveStateIfChanged(sessionId, (state) => ({
    ...state,
    pendingQuestionSummary: question.payload.questions[0]?.question || null,
    statusVerb: 'Waiting for input',
  }));
};

const applyRuntimeSidecarQuestionAnsweredEvent = (
  sessionId: string,
  messageId: string,
  question: RuntimeQuestionEventRecord,
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  const answeredAt = question.payload.answeredAt ?? question.createdAt;
  appendRuntimeSidecarCanonicalEvent(
    sessionId,
    messageId,
    createRuntimeSidecarCanonicalEvent({
      sessionId,
      providerId: located.session.providerId,
      runId: messageId,
      messageId,
      type: 'question.answered',
      payload: {
        questionId: question.questionId,
        answers: question.payload.answers || {},
      },
      ts: answeredAt,
      correlationId: question.questionId,
    }),
    answeredAt,
  );
  patchLiveStateIfChanged(sessionId, (state) => {
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

const applyRuntimeSidecarTurnCompletedEvent = (sessionId: string, messageId: string, emittedAt: number) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  appendRuntimeSidecarCanonicalEvent(
    sessionId,
    messageId,
    createRuntimeSidecarCanonicalEvent({
      sessionId,
      providerId: located.session.providerId,
      runId: messageId,
      messageId,
      type: 'run.completed',
      payload: {
        outcome: 'success',
      },
      ts: emittedAt,
    }),
    emittedAt,
  );
  const runtimeStore = useAgentRuntimeStore.getState();
  runtimeStore.finishRun(sessionId);
  patchLiveStateIfChanged(sessionId, (state) => ({
    ...state,
    activeThinking: false,
    activeToolName: null,
    streamingToolInput: '',
    streamingText: '',
    startedAt: null,
    streamingLatencyTrace: state.streamingLatencyTrace,
    statusVerb: resolvePassiveStatusVerb({
      ...state,
      activeThinking: false,
      activeToolName: null,
    }),
  }));
};

const applyRuntimeSidecarTurnFailedEvent = (
  sessionId: string,
  messageId: string,
  error: string,
  emittedAt: number,
) => {
  const located = findProjectSessionByRuntimeId(sessionId);
  if (!located) {
    return;
  }

  ensureRuntimeThreadProjection(located.projectId, located.session.id);
  appendRuntimeSidecarCanonicalEvent(
    sessionId,
    messageId,
    createRuntimeSidecarCanonicalEvent({
      sessionId,
      providerId: located.session.providerId,
      runId: messageId,
      messageId,
      type: 'error.raised',
      payload: {
        code: 'runtime.sidecar.turn_failed',
        summary: error,
        source: 'runtime',
      },
      ts: emittedAt,
    }),
    emittedAt,
  );
  appendRuntimeSidecarCanonicalEvent(
    sessionId,
    messageId,
    createRuntimeSidecarCanonicalEvent({
      sessionId,
      providerId: located.session.providerId,
      runId: messageId,
      messageId,
      type: 'run.completed',
      payload: {
        outcome: 'failed',
        summary: error,
      },
      ts: emittedAt,
    }),
    emittedAt,
  );
  const runtimeStore = useAgentRuntimeStore.getState();
  runtimeStore.failRun(sessionId, 'Runtime turn failed.');
  patchLiveStateIfChanged(sessionId, (state) => ({
    ...state,
    activeThinking: false,
    activeToolName: null,
    streamingToolInput: '',
    streamingText: '',
    startedAt: null,
    streamingLatencyTrace: state.streamingLatencyTrace,
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
    protocol: config.protocol,
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    model: config.model,
    contextWindowTokens: config.contextWindowTokens,
    customHeaders: config.customHeaders,
  };
};

// apply snapshot 是 sidecar 同步到前端的主入口之一：
// 它会同时更新聊天 session、runtime thread、工具投影、审批投影、liveState 等多个视图。
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
  chatStore.replaceCanonicalEvents(snapshot.session.projectId, nextSession.id, nextSession.canonicalEvents);
  runtimeStore.createThread(snapshot.session.projectId, mapSnapshotToRuntimeThread(snapshot));
  syncRuntimeSidecarSessionProjections(snapshot.session.projectId, snapshot.session.id, snapshot.messages);
};

const applyRuntimeSidecarMessageNow = (
  sessionId: string,
  message: RuntimeMessageRecord,
  eventType: 'message.delta' | 'turn.finished',
  emittedAt: number,
) => {
  if (eventType === 'message.delta') {
    if (message.role === 'assistant') {
      const located = ensureRuntimeAssistantMessage({
        sessionId,
        messageId: message.id,
        createdAt: emittedAt,
      });
      if (located) {
        const textChunk = resolveRuntimeSidecarSnapshotMessageDelta(
          located.session.canonicalEvents || [],
          message.id,
          message.content,
        );
        if (!textChunk) {
          return;
        }

        appendRuntimeSidecarCanonicalEvent(
          sessionId,
          message.id,
          createRuntimeSidecarCanonicalEvent({
            sessionId,
            providerId: located.session.providerId,
            runId: message.id,
            messageId: message.id,
            type: 'message.delta',
            payload: {
              textChunk,
              phase: 'final_answer',
            },
            ts: emittedAt,
          }),
          emittedAt,
        );
      }
    } else {
      commitRuntimeSidecarMessage(sessionId, message);
    }
    return;
  }

  const committed = commitRuntimeSidecarMessage(sessionId, message);
  if (message.role === 'assistant' && committed) {
    appendRuntimeSidecarCanonicalEvent(
      sessionId,
      message.id,
      createRuntimeSidecarCanonicalEvent({
        sessionId,
        providerId: committed.session.providerId,
        runId: message.id,
        messageId: message.id,
        type: 'message.completed',
        payload: {
          finalText: message.content,
          phase: 'final_answer',
        },
        ts: emittedAt,
      }),
      emittedAt,
    );
  }
};

const applyRuntimeSidecarMessageEvent = (
  sessionId: string,
  message: RuntimeMessageRecord,
  eventType: 'message.delta' | 'turn.finished',
  emittedAt: number,
) => {
  runtimeSidecarDeltaCoalescer.flush();
  applyRuntimeSidecarMessageNow(sessionId, message, eventType, emittedAt);
};

const ensureRuntimeEventSubscription = () => {
  if (runtimeEventsSubscribed) {
    return;
  }

  runtimeEventsSubscribed = true;
  subscribeDesktopRuntimeEvents((event: RuntimeEventEnvelope) => {
    if (event.type === 'session.snapshot') {
      runtimeSidecarDeltaCoalescer.flush();
      applyRuntimeSidecarSnapshot(event.payload);
      return;
    }

    if (event.type === 'message.delta' || event.type === 'turn.finished') {
      applyRuntimeSidecarMessageEvent(event.payload.sessionId, event.payload.message, event.type, event.emittedAt);
      return;
    }

    if (event.type === 'turn.delta') {
      applyRuntimeSidecarTurnDeltaEvent(
        event.payload.sessionId,
        event.payload.messageId,
        event.payload.delta,
        event.emittedAt,
        event.payload.trace,
      );
      return;
    }

    if (event.type === 'turn.usage') {
      applyRuntimeSidecarTurnUsageEvent(event.payload.sessionId, event.payload.usage);
      return;
    }

    if (event.type === 'turn.started') {
      applyRuntimeSidecarTurnStartedEvent(event.payload.sessionId, event.payload.messageId, event.emittedAt);
      return;
    }

    if (event.type === 'turn.reasoning') {
      applyRuntimeSidecarReasoningEvent(
        event.payload.sessionId,
        event.payload.messageId,
        event.payload.reasoning,
      );
      return;
    }

    if (event.type === 'tool.started') {
      applyRuntimeSidecarToolStartedEvent(
        event.payload.sessionId,
        event.payload.messageId,
        event.payload.toolCall,
        event.emittedAt,
      );
      return;
    }

    if (event.type === 'tool.finished') {
      applyRuntimeSidecarToolFinishedEvent(
        event.payload.sessionId,
        event.payload.messageId,
        event.payload.toolCall,
        event.emittedAt,
      );
      return;
    }

    if (event.type === 'tool.updated') {
      applyRuntimeSidecarToolUpdatedEvent(
        event.payload.sessionId,
        event.payload.messageId,
        event.payload.toolCall,
        event.emittedAt,
      );
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
      applyRuntimeSidecarApprovalResolvedEvent(
        event.payload.sessionId,
        event.payload.messageId,
        event.payload.approval,
      );
      return;
    }

    if (event.type === 'question.requested') {
      applyRuntimeSidecarQuestionRequestedEvent(
        event.payload.sessionId,
        event.payload.messageId,
        event.payload.question,
      );
      return;
    }

    if (event.type === 'question.answered') {
      applyRuntimeSidecarQuestionAnsweredEvent(
        event.payload.sessionId,
        event.payload.messageId,
        event.payload.question,
      );
      return;
    }

    if (event.type === 'turn.completed') {
      applyRuntimeSidecarTurnCompletedEvent(
        event.payload.sessionId,
        event.payload.messageId,
        event.emittedAt,
      );
      return;
    }

    if (event.type === 'turn.failed') {
      applyRuntimeSidecarTurnFailedEvent(
        event.payload.sessionId,
        event.payload.messageId,
        event.payload.error,
        event.emittedAt,
      );
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

// 页面进入某个项目后，通常先调用这里把该项目的 sidecar sessions 整体拉回前端。
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
  const currentProjectState = chatStore.projects[projectId] || null;
  const runtimeThreads = summaries.map((session) => ({
    id: session.id,
    providerId: toProviderId(session.providerId),
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }));
  const reconciled = reconcileRuntimeThreadsWithSessions({
    projectId,
    sessions: currentProjectState?.sessions || [],
    runtimeThreads,
  });

  chatStore.replaceProjectSessions(
    projectId,
    reconciled.sessions,
    currentProjectState?.activeSessionId &&
      reconciled.sessions.some((session) => session.id === currentProjectState.activeSessionId)
      ? currentProjectState.activeSessionId
      : reconciled.sessions[0]?.id || null,
  );

  if (reconciled.removedSessionIds.length > 0) {
    console.info('[ai-chat] removed stale or duplicate sessions during bootstrap', {
      projectId,
      removedSessionIds: reconciled.removedSessionIds,
    });
  }

  initializedProjects.add(projectId);
  return true;
};

export const deleteRuntimeSidecarSession = async (input: {
  projectId: string;
  sessionId: string;
  runtimeThreadId: string | null;
}): Promise<RuntimeSessionDeleteResult> => {
  if (!input.runtimeThreadId) {
    useAIChatStore.getState().removeSession(input.projectId, input.sessionId);
    return {
      sessionId: input.sessionId,
      deleted: true,
    };
  }

  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return {
      sessionId: input.runtimeThreadId,
      deleted: false,
    };
  }

  const result = await client.deleteSession(input.runtimeThreadId);
  if (!result.deleted) {
    return result;
  }

  useAIChatStore.getState().removeSession(input.projectId, input.sessionId);
  useAgentRuntimeStore.getState().removeThreadState(input.projectId, input.runtimeThreadId);
  useApprovalStore.getState().clearThreadApprovals(input.runtimeThreadId);
  useRuntimeMcpStore.getState().clearThreadToolCalls(input.runtimeThreadId);
  return result;
};

// 显式创建 sidecar session，成功后会立即同步成前端 chat session。
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

// 提交 turn 时会把项目信息、权限模式、历史消息、引用文件、上下文标签和运行配置一起发给 sidecar。
// 如果当前还没有 session，会先隐式创建一个 sidecar session。
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

// 运行中的追问回答会直接回传给 sidecar，再由 sidecar 推下一步执行。
export const answerRuntimeSidecarQuestion = async (input: RuntimeQuestionAnswerInput) => {
  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return false;
  }

  await client.answerQuestion(input);
  return true;
};

// 审批按钮点击后的最终结果会通过这里发回 sidecar。
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
