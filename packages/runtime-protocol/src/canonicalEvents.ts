export const CANONICAL_EVENT_TYPES = [
  'run.started',
  'run.completed',
  'message.started',
  'message.delta',
  'message.completed',
  'reasoning.started',
  'reasoning.delta',
  'reasoning.completed',
  'progress.updated',
  'tool.started',
  'tool.stdout',
  'tool.stderr',
  'tool.completed',
  'approval.requested',
  'approval.resolved',
  'question.requested',
  'question.answered',
  'retry.scheduled',
  'warning.raised',
  'error.raised',
] as const;

export type CanonicalEventType = (typeof CANONICAL_EVENT_TYPES)[number];

export type EventStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'blocked';

export type EventSource = {
  kind: 'user' | 'model' | 'tool' | 'system' | 'runtime';
  provider?: string;
  name?: string;
};

export type MessagePhase = 'commentary' | 'final_answer' | 'unknown';

export type RunStartedPayload = {
  providerId: string;
  threadId?: string | null;
  parentRunId?: string | null;
  mode?: 'chat' | 'agent' | 'team';
};

export type RunCompletedPayload = {
  outcome: 'success' | 'failed' | 'cancelled';
  summary?: string;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export type MessageStartedPayload = {
  role: 'assistant';
  phase?: MessagePhase;
};

export type MessageDeltaPayload = {
  textChunk: string;
  phase?: MessagePhase;
};

export type MessageCompletedPayload = {
  finalText: string;
  phase?: MessagePhase;
};

export type ReasoningStartedPayload = {
  summary?: string;
};

export type ReasoningDeltaPayload = {
  textChunk: string;
};

export type ReasoningCompletedPayload = {
  finalText?: string;
  summary?: string;
};

export type ProgressUpdatedPayload = {
  label: string;
  detail?: string;
  scope?: 'system' | 'phase' | 'tool';
  importance?: 'low' | 'normal' | 'high';
};

export type ToolStartedPayload = {
  toolCallId: string;
  parentToolCallId?: string | null;
  toolName: string;
  displayName?: string;
  inputSummary?: string;
  input?: Record<string, unknown>;
};

export type ToolStreamPayload = {
  toolCallId: string;
  chunk: string;
};

export type CanonicalFileChange = {
  path: string;
  operation?: 'write' | 'edit' | 'delete';
  beforeContent: string | null;
  afterContent: string | null;
  verified?: boolean;
};

export type ToolCompletedPayload = {
  toolCallId: string;
  ok: boolean;
  exitCode?: number | null;
  durationMs?: number;
  summary?: string;
  outputText?: string;
  fileChanges?: CanonicalFileChange[];
};

export type ApprovalRequestedPayload = {
  approvalId: string;
  toolCallId?: string | null;
  actionType: string;
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
  display?: Record<string, unknown>;
};

export type ApprovalResolvedPayload = {
  approvalId: string;
  resolution: 'approved' | 'denied';
};

export type QuestionRequestedPayload = {
  questionId: string;
  toolCallId?: string | null;
  questions: Array<{
    id?: string;
    header?: string;
    question: string;
    options?: Array<{
      label: string;
      description?: string;
    }>;
  }>;
};

export type QuestionAnsweredPayload = {
  questionId: string;
  answers: Record<string, string>;
};

export type RetryScheduledPayload = {
  attempt: number;
  reason: string;
  targetType?: 'tool' | 'provider' | 'run';
  targetId?: string | null;
};

export type WarningRaisedPayload = {
  code: string;
  summary: string;
};

export type ErrorRaisedPayload = {
  code: string;
  summary: string;
  retryable?: boolean;
  source?: 'runtime' | 'tool' | 'provider';
  detail?: string;
};

export type CanonicalEventPayloadMap = {
  'run.started': RunStartedPayload;
  'run.completed': RunCompletedPayload;
  'message.started': MessageStartedPayload;
  'message.delta': MessageDeltaPayload;
  'message.completed': MessageCompletedPayload;
  'reasoning.started': ReasoningStartedPayload;
  'reasoning.delta': ReasoningDeltaPayload;
  'reasoning.completed': ReasoningCompletedPayload;
  'progress.updated': ProgressUpdatedPayload;
  'tool.started': ToolStartedPayload;
  'tool.stdout': ToolStreamPayload;
  'tool.stderr': ToolStreamPayload;
  'tool.completed': ToolCompletedPayload;
  'approval.requested': ApprovalRequestedPayload;
  'approval.resolved': ApprovalResolvedPayload;
  'question.requested': QuestionRequestedPayload;
  'question.answered': QuestionAnsweredPayload;
  'retry.scheduled': RetryScheduledPayload;
  'warning.raised': WarningRaisedPayload;
  'error.raised': ErrorRaisedPayload;
};

export type CanonicalEventPayload = CanonicalEventPayloadMap[CanonicalEventType];

type CanonicalEventBase<TType extends CanonicalEventType> = {
  eventId: string;
  runId: string;
  turnId: string;
  sessionId: string;
  messageId?: string | null;
  parentEventId?: string | null;
  correlationId?: string | null;
  type: TType;
  ts: number;
  seq: number;
  status?: EventStatus;
  source: EventSource;
  payload: CanonicalEventPayloadMap[TType];
  providerMeta?: Record<string, unknown>;
};

export type CanonicalEvent = {
  [TType in CanonicalEventType]: CanonicalEventBase<TType>;
}[CanonicalEventType];

export type CanonicalEventFor<TType extends CanonicalEventType> = Extract<
  CanonicalEvent,
  { type: TType }
>;

export const isCanonicalEventType = (value: string): value is CanonicalEventType =>
  CANONICAL_EVENT_TYPES.includes(value as CanonicalEventType);
