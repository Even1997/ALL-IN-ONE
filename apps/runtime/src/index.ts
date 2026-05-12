import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import {
  DEFAULT_RUNTIME_HOST,
  type RuntimeApprovalResolveInput,
  type RuntimeApprovalEventRecord,
  type RuntimeAssistantTimelineEvent,
  type RuntimeBackgroundTaskRecord,
  type RuntimeCheckpointRecord,
  type RuntimeCheckpointRewindInput,
  type RuntimeConversationHistoryMessage,
  type RuntimeEventEnvelope,
  type RuntimeMessageRecord,
  type RuntimeModelConfig,
  type RuntimeReplayAppendInput,
  type RuntimeQuestionEventRecord,
  type RuntimeQuestionAnswerInput,
  type RuntimeQuestionItem,
  type RuntimeQuestionPayload,
  type RuntimeReasoningEventRecord,
  type RuntimeReferenceFileRecord,
  type RuntimeMcpServerRecord,
  type RuntimeMcpToolInvokeInput,
  type RuntimeSessionDeleteResult,
  type RuntimeSessionCreateInput,
  type RuntimeSessionSnapshot,
  type RuntimeSessionSummary,
  type RuntimeTokenUsageRecord,
  type RuntimeToolCallRecord,
  type RuntimeTurnDeltaTrace,
  type RuntimeTurnSubmitInput,
  buildRuntimeReadyEvent,
} from '@goodnight/runtime-protocol';
import { buildRuntimeEventId } from '../../../src/modules/ai/runtime/dispatch/agentEvents.ts';
import { permissionModeToSandboxPolicy } from '../../../src/modules/ai/runtime/approval/permissionMode.ts';
import {
  classifyRuntimeActionRisk,
  shouldAutoApproveRuntimeAction,
  shouldDenyRuntimeAction,
} from '../../../src/modules/ai/runtime/approval/riskPolicy.ts';
import { createRuntimeStreamingMessageAssembler } from '../../../src/modules/ai/runtime/orchestration/agentTurnRunner.ts';
import { executeRuntimeBuiltInAgentTurn } from '../../../src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts';
import { createRuntimeStreamingDraftScheduler } from '../../../src/modules/ai/runtime/orchestration/runtimeStreamingDraftScheduler.ts';
import type { RuntimeToolStep } from '../../../src/modules/ai/runtime/agent-kernel/agentKernelTypes.ts';
import type { ToolCall, ToolResult } from '../../../src/modules/ai/runtime/tools/toolExecutor.ts';
import {
  ASK_USER_TOOL_NAME,
  getTurnAllowedRuntimeTools,
  RISKY_RUNTIME_TOOLS,
} from '../../../src/modules/ai/runtime/tools/runtimeToolPolicy.ts';
import {
  resolveEditStrings,
  resolveViewFilePathParam,
  resolveWriteFilePathParam,
} from '../../../src/modules/ai/runtime/tools/toolExecutor.ts';
import {
  applyAssistantReasoningProgress,
  buildAssistantStreamingTimeline,
  getAssistantTimelineText,
  syncAssistantTimelineWithToolCalls,
  upsertAssistantRuntimeApprovalEvent,
  upsertAssistantRuntimeQuestionEvent,
} from '../../../src/modules/ai/store/assistantTimeline.ts';
import { NodeRuntimeMcpRegistry } from './nodeRuntimeMcpRegistry.ts';
import { streamRuntimeProviderTurn } from './nodeRuntimeProviderClient.ts';
import { NodeRuntimeReplayStore } from './nodeRuntimeReplayStore.ts';
import { runNodeRuntimeTeamTurn } from './nodeRuntimeTeamRunExecutor.ts';
import { NodeRuntimeToolExecutor } from './nodeRuntimeToolExecutor.ts';

type RuntimeState = {
  sessions: RuntimeSessionSnapshot[];
  backgroundTasksBySession: Record<string, RuntimeBackgroundTaskRecord[]>;
};

type RuntimeConfig = {
  host: string;
  port: number;
  authToken: string;
  dataDir: string;
};

type PendingQuestionAnswer = {
  sessionId: string;
  questionId: string;
  resolve: (answers: Record<string, string>) => void;
  reject: (error: Error) => void;
};

type PendingApprovalResolution = {
  sessionId: string;
  approvalId: string;
  resolve: (approved: boolean) => void;
  reject: (error: Error) => void;
};

const DEFAULT_RUNTIME_PORT = 45731;
const STATE_FILE_NAME = 'sidecar-runtime-state.json';
const CORS_ALLOW_ORIGIN = '*';
const CORS_ALLOW_METHODS = 'GET, POST, OPTIONS';
const CORS_ALLOW_HEADERS = 'authorization, content-type';

const pendingQuestions = new Map<string, PendingQuestionAnswer>();
const pendingApprovals = new Map<string, PendingApprovalResolution>();

const readConfig = (): RuntimeConfig => ({
  host: process.env.GOODNIGHT_RUNTIME_HOST || DEFAULT_RUNTIME_HOST,
  port: Number(process.env.GOODNIGHT_RUNTIME_PORT || DEFAULT_RUNTIME_PORT),
  authToken: process.env.GOODNIGHT_RUNTIME_TOKEN || 'goodnight-local-dev-token',
  dataDir: process.env.GOODNIGHT_RUNTIME_DATA_DIR || path.resolve(process.cwd(), '.runtime-data'),
});

const createId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const createEmptyState = (): RuntimeState => ({
  sessions: [],
  backgroundTasksBySession: {},
});

const getStateFilePath = (config: RuntimeConfig) => path.join(config.dataDir, STATE_FILE_NAME);

const loadState = async (config: RuntimeConfig): Promise<RuntimeState> => {
  await mkdir(config.dataDir, { recursive: true });
  try {
    const file = await readFile(getStateFilePath(config), 'utf8');
    const parsed = JSON.parse(file) as Partial<RuntimeState>;
    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      backgroundTasksBySession:
        parsed.backgroundTasksBySession && typeof parsed.backgroundTasksBySession === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.backgroundTasksBySession).map(([sessionId, tasks]) => [
                sessionId,
                Array.isArray(tasks) ? tasks : [],
              ]),
            )
          : {},
    };
  } catch {
    return createEmptyState();
  }
};

const saveState = async (config: RuntimeConfig, state: RuntimeState) => {
  await writeFile(getStateFilePath(config), JSON.stringify(state, null, 2), 'utf8');
};

const json = (statusCode: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });

const readBody = async <T>(request: Request) => (await request.json()) as T;

const isAuthorized = (request: Request, authToken: string) =>
  request.headers.get('authorization') === `Bearer ${authToken}`;

const buildSessionSummary = (input: RuntimeSessionCreateInput): RuntimeSessionSummary => {
  const now = Date.now();
  return {
    id: createId('session'),
    projectId: input.projectId,
    title: input.title || '新对话',
    providerId: input.providerId || 'built-in',
    createdAt: now,
    updatedAt: now,
  };
};

const buildSnapshot = (input: RuntimeSessionCreateInput): RuntimeSessionSnapshot => ({
  session: buildSessionSummary(input),
  messages: [],
  status: 'idle',
});

const buildAssistantMessage = (content: string, options?: {
  id?: string;
  createdAt?: number;
  timeline?: RuntimeAssistantTimelineEvent[];
}): RuntimeMessageRecord => ({
  id: options?.id || createId('message'),
  role: 'assistant',
  content,
  createdAt: options?.createdAt ?? Date.now(),
  ...(options?.timeline ? { timeline: options.timeline } : {}),
});

const buildUserMessage = (prompt: string): RuntimeMessageRecord => ({
  id: createId('message'),
  role: 'user',
  content: prompt,
  createdAt: Date.now(),
});

const matchSession = (state: RuntimeState, sessionId: string) =>
  state.sessions.find((entry) => entry.session.id === sessionId) || null;

const getProjectSessions = (state: RuntimeState, projectId?: string | null) =>
  state.sessions
    .filter((entry) => !projectId || entry.session.projectId === projectId)
    .map((entry) => entry.session);

const listBackgroundTasks = (state: RuntimeState, sessionId: string) =>
  [...(state.backgroundTasksBySession[sessionId] || [])].sort((left, right) => right.updatedAt - left.updatedAt);

const upsertBackgroundTask = (
  state: RuntimeState,
  sessionId: string,
  task: RuntimeBackgroundTaskRecord,
) => {
  state.backgroundTasksBySession[sessionId] = [
    task,
    ...(state.backgroundTasksBySession[sessionId] || []).filter((entry) => entry.id !== task.id),
  ].sort((left, right) => right.updatedAt - left.updatedAt);
};

const buildSnapshotEvent = (snapshot: RuntimeSessionSnapshot): RuntimeEventEnvelope => ({
  type: 'session.snapshot',
  emittedAt: Date.now(),
  payload: snapshot,
});

const buildTurnEvent = (
  sessionId: string,
  message: RuntimeMessageRecord,
  final: boolean,
): RuntimeEventEnvelope => ({
  type: final ? 'turn.finished' : 'message.delta',
  emittedAt: Date.now(),
  payload: {
    sessionId,
    message,
  },
});

const buildTurnStatusEvent = (
  type: 'turn.started' | 'turn.completed',
  sessionId: string,
  messageId: string,
): RuntimeEventEnvelope => ({
  type,
  emittedAt: Date.now(),
  payload: {
    sessionId,
    messageId,
  },
});

const buildTurnDeltaEvent = (
  sessionId: string,
  messageId: string,
  delta: string,
  trace: RuntimeTurnDeltaTrace,
): RuntimeEventEnvelope => ({
  type: 'turn.delta',
  emittedAt: Date.now(),
  payload: {
    sessionId,
    messageId,
    delta,
    trace,
  },
});

const buildTurnUsageEvent = (
  sessionId: string,
  messageId: string,
  usage: RuntimeTokenUsageRecord,
): RuntimeEventEnvelope => ({
  type: 'turn.usage',
  emittedAt: Date.now(),
  payload: {
    sessionId,
    messageId,
    usage,
  },
});

const buildReasoningEvent = (
  sessionId: string,
  messageId: string,
  reasoning: RuntimeReasoningEventRecord,
): RuntimeEventEnvelope => ({
  type: 'turn.reasoning',
  emittedAt: Date.now(),
  payload: {
    sessionId,
    messageId,
    reasoning,
  },
});

const toRuntimeToolCallRecord = (toolCall: RuntimeToolStep): RuntimeToolCallRecord => ({
  id: toolCall.id,
  parentToolCallId: toolCall.parentToolCallId ?? null,
  name: toolCall.name,
  input: toolCall.input,
  status: toolCall.status,
  resultPreview: toolCall.resultPreview,
  resultContent: toolCall.resultContent,
  fileChanges: toolCall.fileChanges,
});

const buildToolEvent = (
  type: 'tool.started' | 'tool.finished',
  sessionId: string,
  messageId: string,
  toolCall: RuntimeToolStep,
): RuntimeEventEnvelope => ({
  type,
  emittedAt: Date.now(),
  payload: {
    sessionId,
    messageId,
    toolCall: toRuntimeToolCallRecord(toolCall),
  },
});

const buildApprovalEvent = (
  type: 'approval.requested' | 'approval.resolved',
  sessionId: string,
  messageId: string,
  approval: RuntimeApprovalEventRecord,
): RuntimeEventEnvelope => ({
  type,
  emittedAt: Date.now(),
  payload: {
    sessionId,
    messageId,
    approval,
  },
});

const buildQuestionEvent = (
  type: 'question.requested' | 'question.answered',
  sessionId: string,
  messageId: string,
  question: RuntimeQuestionEventRecord,
): RuntimeEventEnvelope => ({
  type,
  emittedAt: Date.now(),
  payload: {
    sessionId,
    messageId,
    question,
  },
});

const buildTurnFailedEvent = (
  sessionId: string,
  messageId: string,
  error: string,
): RuntimeEventEnvelope => ({
  type: 'turn.failed',
  emittedAt: Date.now(),
  payload: {
    sessionId,
    messageId,
    error,
  },
});

const buildCheckpointSavedEvent = (
  sessionId: string,
  checkpoint: RuntimeCheckpointRecord,
): RuntimeEventEnvelope => ({
  type: 'checkpoint.saved',
  emittedAt: Date.now(),
  payload: {
    sessionId,
    checkpoint,
  },
});

const buildBackgroundTaskUpdatedEvent = (
  sessionId: string,
  task: {
    id: string;
    runKind: string;
    title: string;
    status: string;
    summary: string;
    payloadJson: string;
    createdAt: number;
    updatedAt: number;
  },
): RuntimeEventEnvelope => ({
  type: 'background_task.updated',
  emittedAt: Date.now(),
  payload: {
    sessionId,
    task: {
      ...task,
      sessionId,
    },
  },
});

const hasUsableRuntimeConfig = (config?: RuntimeModelConfig | null): config is RuntimeModelConfig =>
  Boolean(config?.provider && config.apiKey.trim() && config.model.trim());

const extractCheckpointFilesFromToolCalls = (toolCalls: RuntimeToolStep[]) => {
  const fileChangesByPath = new Map<
    string,
    {
      path: string;
      beforeContent: string | null;
      afterContent: string | null;
      operation?: 'write' | 'edit' | 'delete';
      verified?: boolean;
    }
  >();

  for (const toolCall of toolCalls) {
    for (const fileChange of toolCall.fileChanges || []) {
      const existing = fileChangesByPath.get(fileChange.path);
      fileChangesByPath.set(fileChange.path, {
        path: fileChange.path,
        beforeContent: existing?.beforeContent ?? fileChange.beforeContent ?? null,
        afterContent: fileChange.afterContent ?? null,
        operation: fileChange.operation,
        verified: existing?.verified ?? fileChange.verified,
      });
    }
  }

  return [...fileChangesByPath.values()];
};

const resolveQuestionOptions = (value: unknown) => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const options = value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const label = 'label' in item && typeof item.label === 'string' ? item.label.trim() : '';
    if (!label) {
      return [];
    }

    return [
      {
        label,
        description:
          'description' in item && typeof item.description === 'string' ? item.description : undefined,
      },
    ];
  });

  return options.length > 0 ? options : undefined;
};

const parseRuntimeQuestionInput = (input: Record<string, unknown>): RuntimeQuestionItem[] => {
  if (typeof input.question === 'string' && input.question.trim()) {
    return [
      {
        question: input.question.trim(),
        header: typeof input.header === 'string' ? input.header : undefined,
        options: resolveQuestionOptions(input.options),
      },
    ];
  }

  if (!Array.isArray(input.questions)) {
    return [];
  }

  return input.questions.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const question = 'question' in item && typeof item.question === 'string' ? item.question.trim() : '';
    if (!question) {
      return [];
    }

    return [
      {
        question,
        header: 'header' in item && typeof item.header === 'string' ? item.header : undefined,
        options: 'options' in item ? resolveQuestionOptions(item.options) : undefined,
      },
    ];
  });
};

const buildApprovalDisplay = (call: ToolCall) => {
  const filePath = resolveWriteFilePathParam(call.input) || resolveViewFilePathParam(call.input);
  const editStrings = resolveEditStrings(call.input);
  const command = typeof call.input.command === 'string' ? call.input.command : null;
  const content = typeof call.input.content === 'string' ? call.input.content : null;

  return {
    toolName: call.name,
    command,
    filePath,
    oldString: editStrings?.oldString || null,
    newString: editStrings?.newString || null,
    content,
    inputJson: JSON.stringify(call.input, null, 2),
  };
};

const buildApprovalSummary = (call: ToolCall) => {
  const filePath = resolveWriteFilePathParam(call.input) || resolveViewFilePathParam(call.input);
  if ((call.name === 'write' || call.name === 'edit') && filePath) {
    return `Modify ${filePath}`;
  }

  if ((call.name === 'bash' || call.name === 'powershell') && typeof call.input.command === 'string') {
    return `Run command: ${call.input.command}`;
  }

  if (call.name === 'fetch' && typeof call.input.url === 'string') {
    return `Fetch URL: ${call.input.url}`;
  }

  return `Run ${call.name}`;
};

const createRuntimeQuestionWaiter = (sessionId: string, questionId: string) =>
  new Promise<Record<string, string>>((resolve, reject) => {
    pendingQuestions.set(questionId, {
      sessionId,
      questionId,
      resolve,
      reject,
    });
  });

const createRuntimeApprovalWaiter = (sessionId: string, approvalId: string) =>
  new Promise<boolean>((resolve, reject) => {
    pendingApprovals.set(approvalId, {
      sessionId,
      approvalId,
      resolve,
      reject,
    });
  });

const completeSubmittedTurn = async (
  config: RuntimeConfig,
  state: RuntimeState,
  input: RuntimeTurnSubmitInput,
  snapshot: RuntimeSessionSnapshot,
  assistantMessageId: string,
  replayStore: NodeRuntimeReplayStore,
  broadcast: (event: RuntimeEventEnvelope) => void,
) => {
  const assistantMessage =
    snapshot.messages.find((message) => message.id === assistantMessageId && message.role === 'assistant') || null;
  const assistantCreatedAt = assistantMessage?.createdAt || Date.now();
  let assistantTimeline = Array.isArray(assistantMessage?.timeline) ? assistantMessage.timeline : [];
  const projectRoot = path.resolve(input.projectRoot || process.cwd());
  const projectName = input.projectName?.trim() || snapshot.session.projectId;
  const runtimeConfig = input.runtimeConfig;
  const sandboxPolicy = permissionModeToSandboxPolicy(input.permissionMode || 'ask');
  const toolExecutor = new NodeRuntimeToolExecutor(projectRoot);
  const streamingAssembler = createRuntimeStreamingMessageAssembler();
  const emittedToolStatuses = new Map<string, RuntimeToolStep['status']>();
  const requestStartedAt = Date.now();
  let providerFirstChunkAt: number | null = null;
  let providerChunkIndex = 0;

  const persistAssistantMessage = async (
    final = false,
    options?: {
      persist?: boolean;
    },
  ) => {
    const nextAssistantMessage = buildAssistantMessage(getAssistantTimelineText(assistantTimeline), {
      id: assistantMessageId,
      createdAt: assistantCreatedAt,
      timeline: assistantTimeline,
    });
    const nextMessages = snapshot.messages.filter((message) => message.id !== assistantMessageId);
    snapshot.messages = [...nextMessages, nextAssistantMessage].sort((left, right) => left.createdAt - right.createdAt);
    snapshot.session.updatedAt = Date.now();
    if (options?.persist !== false) {
      await saveState(config, state);
    }
    broadcast(buildTurnEvent(snapshot.session.id, nextAssistantMessage, final));
    return nextAssistantMessage;
  };

  const emitLatestReasoningEvent = () => {
    const reasoningEvent = [...assistantTimeline]
      .reverse()
      .find(
        (event): event is RuntimeReasoningEventRecord => event.kind === 'reasoning',
      );
    if (!reasoningEvent) {
      return;
    }

    broadcast(buildReasoningEvent(snapshot.session.id, assistantMessageId, reasoningEvent));
  };

  const syncDraftTimeline = async (draft: ReturnType<typeof streamingAssembler.append>, active: boolean) => {
    assistantTimeline = applyAssistantReasoningProgress(
      buildAssistantStreamingTimeline(draft.content, assistantTimeline, {
        fallbackThinkingContent: draft.thinkingContent,
        preferredAssistantParts: draft.assistantParts,
      }),
      {
        active,
        referenceTime: Date.now(),
      },
    ) as RuntimeAssistantTimelineEvent[];
    await persistAssistantMessage(false, { persist: false });
    emitLatestReasoningEvent();
  };
  const draftSyncScheduler = createRuntimeStreamingDraftScheduler({
    applyDraft: (active) => syncDraftTimeline(streamingAssembler.buildDraft(false), active),
  });

  const stopReasoningBeforeTool = async () => {
    await draftSyncScheduler.flush();
    const boundaryDraft = streamingAssembler.markToolBoundary();
    assistantTimeline = applyAssistantReasoningProgress(
      buildAssistantStreamingTimeline(boundaryDraft.content, assistantTimeline, {
        fallbackThinkingContent: boundaryDraft.thinkingContent,
        preferredAssistantParts: boundaryDraft.assistantParts,
      }),
      {
        active: false,
        referenceTime: Date.now(),
      },
    ) as RuntimeAssistantTimelineEvent[];
    await persistAssistantMessage(false);
    emitLatestReasoningEvent();
  };

  try {
    broadcast(buildTurnStatusEvent('turn.started', snapshot.session.id, assistantMessageId));
    await replayStore.appendReplayEvent({
      sessionId: snapshot.session.id,
      eventType: 'turn_started',
      payload: input.prompt,
    });
    broadcast(
      buildReasoningEvent(snapshot.session.id, assistantMessageId, {
        id: `runtime-event_reasoning_${assistantMessageId}`,
        kind: 'reasoning',
        content: '',
        collapsed: true,
        status: 'streaming',
        createdAt: Date.now(),
      }),
    );

    if (!hasUsableRuntimeConfig(runtimeConfig)) {
      throw new Error('Node runtime sidecar 缺少可用模型配置，无法继续执行本次对话。');
    }

    let finalContent = '';
    let completedToolCalls: RuntimeToolStep[] = [];

    if (input.providerId === 'team') {
      const teamResult = await runNodeRuntimeTeamTurn({
        projectId: snapshot.session.projectId,
        projectName,
        sessionId: snapshot.session.id,
        turnId: assistantMessageId,
        projectRoot,
        prompt: input.prompt,
        runtimeConfig,
        contextWindowTokens: runtimeConfig.contextWindowTokens,
        conversationHistory: (input.conversationHistory || []) as RuntimeConversationHistoryMessage[],
        referenceFiles: (input.referenceFiles || []).map((f) => ({
          ...f,
          id: `ref-${f.path}`,
          group: 'project' as const,
          source: 'user' as const,
          relatedIds: [],
        })),
        agentInstructions: input.contextLabels || [],
        onUpdate: async (teamRun) => {
          const backgroundTask = {
            id: teamRun.id,
            sessionId: snapshot.session.id,
            runKind: 'team',
            title: teamRun.summary,
            status: teamRun.status,
            summary: teamRun.finalSummary || teamRun.strategy,
            payloadJson: JSON.stringify(teamRun),
            createdAt: teamRun.createdAt,
            updatedAt: teamRun.updatedAt,
          } satisfies RuntimeBackgroundTaskRecord;
          upsertBackgroundTask(state, snapshot.session.id, backgroundTask);
          await saveState(config, state);
          broadcast({
            type: 'team_run.updated',
            emittedAt: Date.now(),
            payload: {
              sessionId: snapshot.session.id,
              teamRun,
            },
          });
          broadcast(
            buildBackgroundTaskUpdatedEvent(snapshot.session.id, backgroundTask),
          );
        },
      });
      finalContent = teamResult.finalContent;
    } else {
      const result = await executeRuntimeBuiltInAgentTurn({
        projectId: snapshot.session.projectId,
        projectName,
        threadId: snapshot.session.id,
        projectRoot,
        userInput: input.prompt,
        rawUserInput: input.prompt,
        contextWindowTokens: runtimeConfig.contextWindowTokens,
        conversationHistory: (input.conversationHistory || []) as RuntimeConversationHistoryMessage[],
        agentInstructions: [],
        referenceFiles: (input.referenceFiles || []).map((f) => ({
          ...f,
          id: `ref-${f.path}`,
          group: 'project' as const,
          source: 'user' as const,
          relatedIds: [],
        })),
        memoryEntries: [],
        activeSkills: [],
        skillIntent: null,
        contextLabels: input.contextLabels || [],
        allowedTools: getTurnAllowedRuntimeTools({
          sandboxPolicy,
          isWindows: process.platform === 'win32',
        }),
        onModelEvent: async (event) => {
          const providerChunkAt = Date.now();
          if (providerFirstChunkAt === null) {
            providerFirstChunkAt = providerChunkAt;
          }

          if (event.kind === 'text') {
            providerChunkIndex += 1;
            broadcast(
              buildTurnDeltaEvent(snapshot.session.id, assistantMessageId, event.delta, {
                requestStartedAt,
                providerFirstChunkAt: providerFirstChunkAt ?? providerChunkAt,
                providerChunkAt,
                chunkIndex: providerChunkIndex,
              }),
            );
          }

          if (event.kind !== 'thinking' && event.kind !== 'text') {
            return;
          }
          streamingAssembler.appendChunk(event);
          draftSyncScheduler.push(event.kind === 'thinking');
        },
        onToolCallsChange: async (toolCalls) => {
          assistantTimeline = syncAssistantTimelineWithToolCalls(
            assistantTimeline,
            toolCalls as RuntimeToolStep[],
          ) as RuntimeAssistantTimelineEvent[];
          await persistAssistantMessage(false);
          toolCalls.forEach((toolCall) => {
            const previousStatus = emittedToolStatuses.get(toolCall.id);
            if (!previousStatus) {
              emittedToolStatuses.set(toolCall.id, toolCall.status);
              broadcast(buildToolEvent('tool.started', snapshot.session.id, assistantMessageId, toolCall));
              return;
            }

            if (previousStatus !== toolCall.status && toolCall.status !== 'running') {
              emittedToolStatuses.set(toolCall.id, toolCall.status);
              broadcast(buildToolEvent('tool.finished', snapshot.session.id, assistantMessageId, toolCall));
            }
          });
        },
        beforeToolCall: async (call) => {
          await stopReasoningBeforeTool();
          if (call.name === ASK_USER_TOOL_NAME || !RISKY_RUNTIME_TOOLS.has(call.name)) {
            return;
          }

          const actionType = `tool_${call.name.toLowerCase()}`;
          const riskLevel = classifyRuntimeActionRisk(actionType);
          const summary = buildApprovalSummary(call);
          const approvalId = createId('approval');
          const createdAt = Date.now();
          const display = buildApprovalDisplay(call);

          if (shouldDenyRuntimeAction({ riskLevel, sandboxPolicy })) {
            assistantTimeline = upsertAssistantRuntimeApprovalEvent(assistantTimeline, {
              id: buildRuntimeEventId('approval', approvalId),
              kind: 'approval',
              approvalId,
              toolCallId: call.id,
              actionType,
              summary,
              riskLevel,
              status: 'denied',
              display,
              createdAt,
            }) as RuntimeAssistantTimelineEvent[];
            await persistAssistantMessage(false);
            throw new Error(`Current sandbox policy (${sandboxPolicy}) blocks ${call.name}.`);
          }

          if (shouldAutoApproveRuntimeAction({ riskLevel, sandboxPolicy })) {
            return;
          }

          assistantTimeline = upsertAssistantRuntimeApprovalEvent(assistantTimeline, {
            id: buildRuntimeEventId('approval', approvalId),
            kind: 'approval',
            approvalId,
            toolCallId: call.id,
            actionType,
            summary,
            riskLevel,
            status: 'pending',
            display,
            createdAt,
          }) as RuntimeAssistantTimelineEvent[];
          await persistAssistantMessage(false);
          broadcast(
            buildApprovalEvent('approval.requested', snapshot.session.id, assistantMessageId, {
              id: buildRuntimeEventId('approval', approvalId),
              kind: 'approval',
              approvalId,
              toolCallId: call.id,
              actionType,
              summary,
              riskLevel,
              status: 'pending',
              display,
              createdAt,
            }),
          );

          const approved = await createRuntimeApprovalWaiter(snapshot.session.id, approvalId).finally(() => {
            pendingApprovals.delete(approvalId);
          });

          const resolvedApprovalEvent: RuntimeApprovalEventRecord = {
            id: buildRuntimeEventId('approval', approvalId),
            kind: 'approval',
            approvalId,
            toolCallId: call.id,
            actionType,
            summary,
            riskLevel,
            status: approved ? 'approved' : 'denied',
            display,
            createdAt,
            resolvedAt: Date.now(),
          };
          assistantTimeline = upsertAssistantRuntimeApprovalEvent(
            assistantTimeline,
            resolvedApprovalEvent,
          ) as RuntimeAssistantTimelineEvent[];
          await persistAssistantMessage(false);
          broadcast(
            buildApprovalEvent(
              'approval.resolved',
              snapshot.session.id,
              assistantMessageId,
              resolvedApprovalEvent,
            ),
          );

          if (!approved) {
            throw new Error(`User denied ${call.name}.`);
          }
        },
        executeModel: (prompt, systemPrompt, onEvent) =>
          streamRuntimeProviderTurn({
            runtimeConfig,
            prompt,
            systemPrompt,
            onEvent: async (event) => {
              if (event.kind === 'thinking' || event.kind === 'text') {
                await onEvent?.(event);
                return;
              }

              if (event.kind === 'tool_call') {
                await onEvent?.({
                  kind: 'tool_call',
                  delta: '',
                  toolCall: event.toolCall,
                });
                return;
              }

              if (event.kind === 'usage') {
                broadcast(
                  buildTurnUsageEvent(snapshot.session.id, assistantMessageId, {
                    inputTokens: event.inputTokens,
                    outputTokens: event.outputTokens,
                    ...(typeof event.totalTokens === 'number'
                      ? { totalTokens: event.totalTokens }
                      : {}),
                  }),
                );
              }
            },
          }),
        executeTool: async (call): Promise<ToolResult> => {
          if (call.name !== ASK_USER_TOOL_NAME) {
            return toolExecutor.execute(call);
          }

          const questions = parseRuntimeQuestionInput(call.input);
          if (questions.length === 0) {
            return {
              type: 'text',
              content: 'AskUserQuestion requires a question or questions payload.',
              is_error: true,
            };
          }

          const questionId = createId('runtime-question');
          const createdAt = Date.now();
          const payload: RuntimeQuestionPayload = {
            id: questionId,
            toolCallId: call.id,
            status: 'pending',
            questions,
            createdAt,
          };

          const pendingQuestionEvent: RuntimeQuestionEventRecord = {
            id: buildRuntimeEventId('question', questionId),
            kind: 'question',
            questionId,
            payload,
            createdAt,
          };
          assistantTimeline = upsertAssistantRuntimeQuestionEvent(
            assistantTimeline,
            pendingQuestionEvent,
          ) as RuntimeAssistantTimelineEvent[];
          await persistAssistantMessage(false);
          broadcast(
            buildQuestionEvent(
              'question.requested',
              snapshot.session.id,
              assistantMessageId,
              pendingQuestionEvent,
            ),
          );

          const answers = await createRuntimeQuestionWaiter(snapshot.session.id, questionId).finally(() => {
            pendingQuestions.delete(questionId);
          });

          const answeredQuestionEvent: RuntimeQuestionEventRecord = {
            id: buildRuntimeEventId('question', questionId),
            kind: 'question',
            questionId,
            payload: {
              ...payload,
              status: 'answered',
              answers,
              answeredAt: Date.now(),
            },
            createdAt,
          };
          assistantTimeline = upsertAssistantRuntimeQuestionEvent(
            assistantTimeline,
            answeredQuestionEvent,
          ) as RuntimeAssistantTimelineEvent[];
          await persistAssistantMessage(false);
          broadcast(
            buildQuestionEvent(
              'question.answered',
              snapshot.session.id,
              assistantMessageId,
              answeredQuestionEvent,
            ),
          );

          return {
            type: 'text',
            content: `User answers:\n${JSON.stringify(answers, null, 2)}`,
          };
        },
      });

      finalContent = result.finalContent;
      completedToolCalls = result.toolCalls as RuntimeToolStep[];
    }

    await draftSyncScheduler.flush();
    const finalDraft = streamingAssembler.buildFinal(finalContent);
    assistantTimeline = applyAssistantReasoningProgress(
      buildAssistantStreamingTimeline(finalDraft.content, assistantTimeline, {
        fallbackThinkingContent: finalDraft.thinkingContent,
        preferredAssistantParts: finalDraft.assistantParts,
      }),
      {
        active: false,
        referenceTime: Date.now(),
      },
    ) as RuntimeAssistantTimelineEvent[];
    assistantTimeline = syncAssistantTimelineWithToolCalls(
      assistantTimeline,
      completedToolCalls,
    ) as RuntimeAssistantTimelineEvent[];
    const checkpointFiles = extractCheckpointFilesFromToolCalls(completedToolCalls);
    const checkpoint = await replayStore.saveCheckpoint({
      sessionId: snapshot.session.id,
      runId: assistantMessageId,
      messageId: assistantMessageId,
      summary: `Updated ${checkpointFiles.map((file) => file.path).join('、')}`,
      projectRoot,
      files: checkpointFiles,
    });
    if (checkpoint) {
      broadcast(buildCheckpointSavedEvent(snapshot.session.id, checkpoint));
    }
    snapshot.status = 'idle';
    const finalAssistantMessage = await persistAssistantMessage(true);
    await replayStore.appendReplayEvent({
      sessionId: snapshot.session.id,
      eventType: 'turn_completed',
      payload: finalContent,
    });
    broadcast(buildTurnStatusEvent('turn.completed', snapshot.session.id, assistantMessageId));
    broadcast(buildSnapshotEvent(snapshot));
    return finalAssistantMessage;
  } catch (error) {
    draftSyncScheduler.cancel();
    const message = `Node runtime sidecar 执行失败：${error instanceof Error ? error.message : String(error)}`;
    assistantTimeline = [
      ...assistantTimeline,
      {
        id: `runtime-event_error_${createId('runtime-error')}`,
        kind: 'error',
        message,
        source: 'runtime',
        createdAt: Date.now(),
      },
    ];
    snapshot.status = 'failed';
    const failedAssistantMessage = buildAssistantMessage(getAssistantTimelineText(assistantTimeline) || message, {
      id: assistantMessageId,
      createdAt: assistantCreatedAt,
      timeline: assistantTimeline,
    });
    snapshot.messages = snapshot.messages
      .filter((entry) => entry.id !== assistantMessageId)
      .concat(failedAssistantMessage)
      .sort((left, right) => left.createdAt - right.createdAt);
    snapshot.session.updatedAt = Date.now();
    await saveState(config, state);
    await replayStore.appendReplayEvent({
      sessionId: snapshot.session.id,
      eventType: 'turn_failed',
      payload: message,
    });
    broadcast(buildSnapshotEvent(snapshot));
    broadcast(buildTurnEvent(snapshot.session.id, failedAssistantMessage, true));
    broadcast(buildTurnFailedEvent(snapshot.session.id, assistantMessageId, message));
  }
};

const main = async () => {
  const config = readConfig();
  const state = await loadState(config);
  const mcpRegistry = new NodeRuntimeMcpRegistry(config.dataDir);
  const replayStore = new NodeRuntimeReplayStore(config.dataDir);
  const clients = new Set<import('ws').WebSocket>();

  const broadcast = (event: RuntimeEventEnvelope) => {
    const serialized = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(serialized);
      }
    }
  };

  const server = createServer(async (incomingMessage, response) => {
    const origin = `http://${incomingMessage.headers.host || `${config.host}:${config.port}`}`;
    const url = new URL(incomingMessage.url || '/', origin);
    const request = new Request(url, {
      method: incomingMessage.method,
      headers: incomingMessage.headers as HeadersInit,
      body:
        incomingMessage.method && ['POST', 'PUT', 'PATCH'].includes(incomingMessage.method)
          ? incomingMessage
          : null,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const send = async (result: Response) => {
      response.statusCode = result.status;
      result.headers.forEach((value, key) => {
        response.setHeader(key, value);
      });
      response.setHeader('access-control-allow-origin', CORS_ALLOW_ORIGIN);
      response.setHeader('access-control-allow-methods', CORS_ALLOW_METHODS);
      response.setHeader('access-control-allow-headers', CORS_ALLOW_HEADERS);
      response.end(await result.text());
    };

    try {
      if (request.method === 'OPTIONS') {
        await send(new Response(null, { status: 204 }));
        return;
      }

      if (url.pathname === '/health' && request.method === 'GET') {
        await send(
          json(200, {
            ok: true,
            runtime: 'node-sidecar',
          }),
        );
        return;
      }

      if (!isAuthorized(request, config.authToken)) {
        await send(json(401, { error: 'Unauthorized' }));
        return;
      }

      if (url.pathname === '/sessions' && request.method === 'GET') {
        await send(
          json(200, {
            sessions: getProjectSessions(state, url.searchParams.get('projectId')),
          }),
        );
        return;
      }

      if (url.pathname === '/sessions' && request.method === 'POST') {
        const input = await readBody<RuntimeSessionCreateInput>(request);
        const snapshot = buildSnapshot(input);
        state.sessions.unshift(snapshot);
        await saveState(config, state);
        broadcast(buildSnapshotEvent(snapshot));
        await send(json(201, snapshot));
        return;
      }

      if (url.pathname === '/sessions/delete' && request.method === 'POST') {
        const body = await readBody<{ sessionId: string }>(request);
        const existing = matchSession(state, body.sessionId);
        if (!existing) {
          await send(json(404, { error: 'Session not found' }));
          return;
        }

        state.sessions = state.sessions.filter((entry) => entry.session.id !== body.sessionId);
        delete state.backgroundTasksBySession[body.sessionId];
        await replayStore.deleteSessionArtifacts(body.sessionId);
        await saveState(config, state);
        await send(
          json(200, {
            sessionId: body.sessionId,
            deleted: true,
          } satisfies RuntimeSessionDeleteResult),
        );
        return;
      }

      if (url.pathname.startsWith('/sessions/') && url.pathname.endsWith('/mcp-tool-calls') && request.method === 'GET') {
        const sessionId = url.pathname.split('/')[2] || '';
        await send(
          json(200, {
            toolCalls: await mcpRegistry.listToolCalls(sessionId),
          }),
        );
        return;
      }

      if (url.pathname.startsWith('/sessions/') && url.pathname.endsWith('/background-tasks') && request.method === 'GET') {
        const sessionId = url.pathname.split('/')[2] || '';
        await send(
          json(200, {
            tasks: listBackgroundTasks(state, sessionId),
          }),
        );
        return;
      }

      if (url.pathname.startsWith('/sessions/') && url.pathname.endsWith('/checkpoints') && request.method === 'GET') {
        const sessionId = url.pathname.split('/')[2] || '';
        await send(
          json(200, {
            checkpoints: await replayStore.listCheckpoints(sessionId),
          }),
        );
        return;
      }

      if (url.pathname.startsWith('/sessions/') && url.pathname.endsWith('/replay-events') && request.method === 'GET') {
        const sessionId = url.pathname.split('/')[2] || '';
        await send(
          json(200, {
            events: await replayStore.listReplayEvents(sessionId),
          }),
        );
        return;
      }

      if (url.pathname.startsWith('/sessions/') && request.method === 'GET') {
        const sessionId = url.pathname.split('/').pop() || '';
        const snapshot = matchSession(state, sessionId);
        await send(snapshot ? json(200, snapshot) : json(404, { error: 'Session not found' }));
        return;
      }

      if (url.pathname === '/mcp/servers' && request.method === 'GET') {
        await send(
          json(200, {
            servers: await mcpRegistry.listServers(),
          }),
        );
        return;
      }

      if (url.pathname === '/mcp/servers/upsert' && request.method === 'POST') {
        const body = await readBody<RuntimeMcpServerRecord>(request);
        await send(json(200, await mcpRegistry.upsertServer(body)));
        return;
      }

      if (url.pathname === '/mcp/servers/delete' && request.method === 'POST') {
        const body = await readBody<{ id: string }>(request);
        await send(json(200, await mcpRegistry.deleteServer(body.id)));
        return;
      }

      if (url.pathname === '/mcp/tools/invoke' && request.method === 'POST') {
        const body = await readBody<RuntimeMcpToolInvokeInput>(request);
        await send(json(200, await mcpRegistry.invokeTool(body)));
        return;
      }

      if (url.pathname === '/replay-events/append' && request.method === 'POST') {
        const body = await readBody<RuntimeReplayAppendInput>(request);
        await send(json(200, await replayStore.appendReplayEvent(body)));
        return;
      }

      if (url.pathname === '/checkpoints/diff' && request.method === 'GET') {
        const sessionId = url.searchParams.get('sessionId') || '';
        const runId = url.searchParams.get('runId') || '';
        const filePath = url.searchParams.get('path') || '';
        await send(
          json(
            200,
            await replayStore.getCheckpointDiff({
              sessionId,
              runId,
              path: filePath,
            }),
          ),
        );
        return;
      }

      if (url.pathname === '/checkpoints/rewind' && request.method === 'POST') {
        const body = await readBody<RuntimeCheckpointRewindInput>(request);
        await send(json(200, await replayStore.rewindCheckpoint(body)));
        return;
      }

      if (url.pathname === '/questions/answer' && request.method === 'POST') {
        const body = await readBody<RuntimeQuestionAnswerInput>(request);
        const pendingQuestion = pendingQuestions.get(body.questionId);
        if (!pendingQuestion || pendingQuestion.sessionId !== body.sessionId) {
          await send(json(404, { error: 'Question not found' }));
          return;
        }

        pendingQuestion.resolve(body.answers);
        await send(json(202, { accepted: true }));
        return;
      }

      if (url.pathname === '/approvals/resolve' && request.method === 'POST') {
        const body = await readBody<RuntimeApprovalResolveInput>(request);
        const pendingApproval = pendingApprovals.get(body.approvalId);
        if (!pendingApproval || pendingApproval.sessionId !== body.sessionId) {
          await send(json(404, { error: 'Approval not found' }));
          return;
        }

        pendingApproval.resolve(body.status === 'approved');
        await send(json(202, { accepted: true }));
        return;
      }

      if (url.pathname === '/turns' && request.method === 'POST') {
        const body = await readBody<RuntimeTurnSubmitInput>(request);
        const snapshot = matchSession(state, body.sessionId);
        if (!snapshot) {
          await send(json(404, { error: 'Session not found' }));
          return;
        }

        const userMessage = buildUserMessage(body.prompt);
        const assistantMessage = buildAssistantMessage('', {
          timeline: [],
        });
        snapshot.messages = [...snapshot.messages, userMessage, assistantMessage];
        snapshot.status = 'running';
        snapshot.session.updatedAt = Date.now();
        await saveState(config, state);
        broadcast(buildSnapshotEvent(snapshot));
        await send(json(202, { accepted: true }));
        void completeSubmittedTurn(
          config,
          state,
          body,
          snapshot,
          assistantMessage.id,
          replayStore,
          broadcast,
        );
        return;
      }

      await send(json(404, { error: 'Not found' }));
    } catch (error) {
      if (response.writableEnded) {
        return;
      }

      await send(
        json(error instanceof SyntaxError ? 400 : 500, {
          error: error instanceof SyntaxError ? 'Invalid JSON body' : 'Runtime request failed',
        }),
      );
    }
  });

  const wsServer = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    const origin = `http://${request.headers.host || `${config.host}:${config.port}`}`;
    const url = new URL(request.url || '/', origin);
    if (url.pathname !== '/events' || url.searchParams.get('token') !== config.authToken) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wsServer.handleUpgrade(request, socket, head, (client: import('ws').WebSocket) => {
      clients.add(client);
      client.send(JSON.stringify(buildRuntimeReadyEvent()));
      client.on('close', () => {
        clients.delete(client);
      });
    });
  });

  server.listen(config.port, config.host, () => {
    console.log(
      `[runtime-sidecar] listening on http://${config.host}:${config.port} with data dir ${config.dataDir}`,
    );
  });
};

void main();
