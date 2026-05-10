export const DEFAULT_RUNTIME_HOST = '127.0.0.1';

export type RuntimeSessionSummary = {
  id: string;
  projectId: string;
  title: string;
  providerId: string;
  createdAt: number;
  updatedAt: number;
};

export type RuntimeMessageRecord = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  timeline?: RuntimeAssistantTimelineEvent[];
};

export type RuntimeQuestionOption = {
  label: string;
  description?: string;
};

export type RuntimeQuestionItem = {
  question: string;
  header?: string;
  options?: RuntimeQuestionOption[];
};

export type RuntimeQuestionPayload = {
  id: string;
  toolCallId?: string | null;
  status: 'pending' | 'answered';
  questions: RuntimeQuestionItem[];
  answers?: Record<string, string>;
  createdAt: number;
};

export type RuntimeStoredFileChange = {
  path: string;
  operation?: 'write' | 'edit' | 'delete';
  beforeContent: string | null;
  afterContent: string | null;
  verified?: boolean;
};

export type RuntimeApprovalDisplay = {
  toolName?: string | null;
  command?: string | null;
  filePath?: string | null;
  oldString?: string | null;
  newString?: string | null;
  content?: string | null;
  inputJson?: string | null;
};

export type RuntimeAssistantTimelineEvent =
  | {
      id: string;
      kind: 'text';
      content: string;
      createdAt: number;
    }
  | {
      id: string;
      kind: 'reasoning';
      content: string;
      collapsed: boolean;
      status: 'streaming' | 'completed';
      elapsedSeconds?: number;
      createdAt: number;
    }
  | {
      id: string;
      kind: 'error';
      message: string;
      source?: 'runtime' | 'tool' | 'provider';
      createdAt: number;
    }
  | {
      id: string;
      kind: 'tool_use';
      toolCallId: string;
      parentToolCallId?: string | null;
      toolName: string;
      input: Record<string, unknown>;
      status: 'running' | 'completed' | 'failed' | 'blocked';
      createdAt: number;
    }
  | {
      id: string;
      kind: 'tool_result';
      toolCallId: string;
      parentToolCallId?: string | null;
      toolName: string;
      status: 'running' | 'completed' | 'failed' | 'blocked';
      output: string;
      fileChanges?: RuntimeStoredFileChange[];
      createdAt: number;
    }
  | {
      id: string;
      kind: 'approval';
      approvalId: string;
      toolCallId?: string | null;
      actionType: string;
      summary: string;
      riskLevel: 'low' | 'medium' | 'high';
      status: 'pending' | 'approved' | 'denied';
      display?: RuntimeApprovalDisplay;
      createdAt: number;
    }
  | {
      id: string;
      kind: 'question';
      questionId: string;
      payload: RuntimeQuestionPayload;
      createdAt: number;
    };

export type RuntimeReasoningEventRecord = Extract<
  RuntimeAssistantTimelineEvent,
  { kind: 'reasoning' }
>;

export type RuntimeApprovalEventRecord = Extract<
  RuntimeAssistantTimelineEvent,
  { kind: 'approval' }
>;

export type RuntimeQuestionEventRecord = Extract<
  RuntimeAssistantTimelineEvent,
  { kind: 'question' }
>;

export type RuntimeToolCallRecord = {
  id: string;
  parentToolCallId?: string | null;
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed' | 'blocked';
  resultPreview: string;
  resultContent?: string;
  fileChanges?: RuntimeStoredFileChange[];
};

export type RuntimeReplayEvent = {
  id: string;
  sessionId: string;
  eventType: string;
  payload: string;
  createdAt: number;
};

export type RuntimeReplayAppendInput = {
  sessionId: string;
  eventType: string;
  payload: string;
};

export type RuntimeCheckpointFileRecord = {
  path: string;
  changeType: 'created' | 'updated' | 'deleted';
  insertions: number;
  deletions: number;
};

export type RuntimeCheckpointRecord = {
  id: string;
  sessionId: string;
  runId: string;
  messageId: string | null;
  summary: string;
  filesChanged: RuntimeCheckpointFileRecord[];
  insertions: number;
  deletions: number;
  createdAt: number;
  updatedAt: number;
};

export type RuntimeCheckpointDiffRecord = {
  checkpointId: string;
  sessionId: string;
  runId: string;
  path: string;
  changeType: 'created' | 'updated' | 'deleted';
  beforeContent: string | null;
  afterContent: string | null;
  diff: string;
  insertions: number;
  deletions: number;
  createdAt: number;
};

export type RuntimeCheckpointRewindResult = {
  sessionId: string;
  runId: string;
  restoredPaths: string[];
  removedRunIds: string[];
  checkpointCount: number;
  rewoundAt: number;
};

export type RuntimeBackgroundTaskRecord = {
  id: string;
  sessionId: string;
  runKind: string;
  title: string;
  status: string;
  summary: string;
  payloadJson: string;
  createdAt: number;
  updatedAt: number;
};

export type RuntimeTokenUsageRecord = {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
};

export type RuntimeMcpTransport = 'builtin' | 'stdio' | 'http' | 'sse';

export type RuntimeMcpToolDefinition = {
  name: string;
  description: string;
  requiresApproval: boolean;
};

export type RuntimeMcpOAuthConfig = {
  clientId?: string | null;
  callbackPort?: number | null;
};

export type RuntimeMcpServerRecord = {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  transport: RuntimeMcpTransport;
  description: string;
  enabled: boolean;
  toolNames: string[];
  tools?: RuntimeMcpToolDefinition[];
  command?: string | null;
  args?: string[];
  env?: Record<string, string>;
  url?: string | null;
  headers?: Record<string, string>;
  headersHelper?: string | null;
  oauth?: RuntimeMcpOAuthConfig | null;
};

export type RuntimeMcpToolCallRecord = {
  id: string;
  threadId: string;
  serverId: string;
  toolName: string;
  status: 'running' | 'completed' | 'error';
  summary: string;
  resultPreview: string;
  argumentsText: string;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
};

export type RuntimeMcpDeleteResult = {
  id: string;
  deleted: boolean;
};

export type RuntimeTeamRunPhaseRecord = {
  id: string;
  title: string;
  summary: string;
  goal: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: number | null;
  completedAt: number | null;
  taskIds: string[];
};

export type RuntimeTeamRunMemberRecord = {
  id: string;
  sessionId: string;
  parentTurnId: string;
  taskId: string;
  phaseId: string;
  role: string;
  agentId: string;
  title: string;
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: number | null;
  completedAt: number | null;
  result: string;
  error: string | null;
  dependsOn: string[];
  changedPaths: string[];
};

export type RuntimeTeamRunRecord = {
  id: string;
  sessionId: string;
  turnId: string;
  providerId: 'team';
  summary: string;
  strategy: string;
  status: 'planning' | 'running' | 'completed' | 'failed';
  phases: RuntimeTeamRunPhaseRecord[];
  members: RuntimeTeamRunMemberRecord[];
  finalSummary: string;
  changedPaths: string[];
  createdAt: number;
  updatedAt: number;
};

export type RuntimeConversationHistoryMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type RuntimeReferenceFileRecord = {
  path: string;
  title: string;
  content: string;
  type: 'md' | 'html' | 'json' | 'txt';
  updatedAt: string;
  readableByAI: boolean;
  summary: string;
  tags: string[];
};

export type RuntimeSessionSnapshot = {
  session: RuntimeSessionSummary;
  messages: RuntimeMessageRecord[];
  status: 'idle' | 'running' | 'failed';
};

export type RuntimeSessionCreateInput = {
  projectId: string;
  title?: string;
  providerId?: string;
};

export type RuntimeModelConfig = {
  provider: 'openai-compatible' | 'anthropic';
  apiKey: string;
  baseURL: string;
  model: string;
  contextWindowTokens: number;
  customHeaders?: string;
};

export type RuntimeTurnSubmitInput = {
  sessionId: string;
  prompt: string;
  providerId?: string;
  projectName?: string;
  projectRoot?: string;
  permissionMode?: 'ask' | 'plan' | 'auto' | 'bypass';
  conversationHistory?: RuntimeConversationHistoryMessage[];
  referenceFiles?: RuntimeReferenceFileRecord[];
  contextLabels?: string[];
  runtimeConfig?: RuntimeModelConfig | null;
};

export type RuntimeQuestionAnswerInput = {
  sessionId: string;
  questionId: string;
  answers: Record<string, string>;
};

export type RuntimeApprovalResolveInput = {
  sessionId: string;
  approvalId: string;
  status: 'approved' | 'denied';
};

export type RuntimeCheckpointRewindInput = {
  sessionId: string;
  checkpointId: string;
};

export type RuntimeMcpToolInvokeInput = {
  threadId: string;
  serverId: string;
  toolName: string;
  argumentsText?: string;
};

export type RuntimeEventEnvelope =
  | {
      type: 'runtime.ready';
      emittedAt: number;
      payload: {
        host: string;
      };
    }
  | {
      type: 'session.snapshot';
      emittedAt: number;
      payload: RuntimeSessionSnapshot;
    }
  | {
      type: 'message.delta' | 'turn.finished';
      emittedAt: number;
      payload: {
        sessionId: string;
        message: RuntimeMessageRecord;
      };
    }
  | {
      type: 'turn.delta';
      emittedAt: number;
      payload: {
        sessionId: string;
        messageId: string;
        delta: string;
      };
    }
  | {
      type: 'turn.usage';
      emittedAt: number;
      payload: {
        sessionId: string;
        messageId: string;
        usage: RuntimeTokenUsageRecord;
      };
    }
  | {
      type: 'turn.started' | 'turn.completed';
      emittedAt: number;
      payload: {
        sessionId: string;
        messageId: string;
      };
    }
  | {
      type: 'turn.reasoning';
      emittedAt: number;
      payload: {
        sessionId: string;
        messageId: string;
        reasoning: RuntimeReasoningEventRecord;
      };
    }
  | {
      type: 'tool.started' | 'tool.finished';
      emittedAt: number;
      payload: {
        sessionId: string;
        messageId: string;
        toolCall: RuntimeToolCallRecord;
      };
    }
  | {
      type: 'tool.updated';
      emittedAt: number;
      payload: {
        sessionId: string;
        messageId: string;
        toolCall: RuntimeToolCallRecord;
      };
    }
  | {
      type: 'approval.requested' | 'approval.resolved';
      emittedAt: number;
      payload: {
        sessionId: string;
        messageId: string;
        approval: RuntimeApprovalEventRecord;
      };
    }
  | {
      type: 'question.requested' | 'question.answered';
      emittedAt: number;
      payload: {
        sessionId: string;
        messageId: string;
        question: RuntimeQuestionEventRecord;
      };
    }
  | {
      type: 'turn.failed';
      emittedAt: number;
      payload: {
        sessionId: string;
        messageId: string;
        error: string;
      };
    }
  | {
      type: 'checkpoint.saved';
      emittedAt: number;
      payload: {
        sessionId: string;
        checkpoint: RuntimeCheckpointRecord;
      };
    }
  | {
      type: 'background_task.updated';
      emittedAt: number;
      payload: {
        sessionId: string;
        task: RuntimeBackgroundTaskRecord;
      };
    }
  | {
      type: 'team_run.updated';
      emittedAt: number;
      payload: {
        sessionId: string;
        teamRun: RuntimeTeamRunRecord;
      };
    };

export const buildRuntimeReadyEvent = (): RuntimeEventEnvelope => ({
  type: 'runtime.ready',
  emittedAt: Date.now(),
  payload: {
    host: DEFAULT_RUNTIME_HOST,
  },
});

export const isRuntimeEventEnvelope = (value: unknown): value is RuntimeEventEnvelope => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RuntimeEventEnvelope>;
  return typeof candidate.type === 'string' && typeof candidate.emittedAt === 'number';
};
