import {
  isCanonicalEventType,
  type CanonicalEvent,
  type CanonicalEventType,
} from './canonicalEvents.ts';

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`);
  }
}

function assertOptionalString(value: unknown, label: string): void {
  if (value != null && typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
}

function assertNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${label} must be a number`);
  }
}

function assertBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean`);
  }
}

function validatePayloadForType(
  type: CanonicalEventType,
  payload: Record<string, unknown>,
): void {
  switch (type) {
    case 'run.started':
      assertString(payload.providerId, 'run.started payload.providerId');
      break;
    case 'run.completed':
      assertString(payload.outcome, 'run.completed payload.outcome');
      break;
    case 'message.started':
      assertString(payload.role, 'message.started payload.role');
      break;
    case 'message.delta':
      assertString(payload.textChunk, 'message.delta payload.textChunk');
      break;
    case 'message.completed':
      assertString(payload.finalText, 'message.completed payload.finalText');
      break;
    case 'progress.updated':
      assertString(payload.label, 'progress.updated payload.label');
      break;
    case 'tool.started':
      assertString(payload.toolCallId, 'tool.started payload.toolCallId');
      assertString(payload.toolName, 'tool.started payload.toolName');
      break;
    case 'tool.stdout':
    case 'tool.stderr':
      assertString(payload.toolCallId, `${type} payload.toolCallId`);
      if (typeof payload.chunk !== 'string') {
        throw new Error(`${type} payload.chunk is required`);
      }
      break;
    case 'tool.completed':
      assertString(payload.toolCallId, 'tool.completed payload.toolCallId');
      assertBoolean(payload.ok, 'tool.completed payload.ok');
      break;
    case 'approval.requested':
      assertString(payload.approvalId, 'approval.requested payload.approvalId');
      assertString(payload.actionType, 'approval.requested payload.actionType');
      assertString(payload.summary, 'approval.requested payload.summary');
      break;
    case 'approval.resolved':
      assertString(payload.approvalId, 'approval.resolved payload.approvalId');
      assertString(payload.resolution, 'approval.resolved payload.resolution');
      break;
    case 'question.requested':
      assertString(payload.questionId, 'question.requested payload.questionId');
      if (!Array.isArray(payload.questions)) {
        throw new Error('question.requested payload.questions must be an array');
      }
      break;
    case 'question.answered':
      assertString(payload.questionId, 'question.answered payload.questionId');
      assertObject(payload.answers, 'question.answered payload.answers');
      break;
    case 'retry.scheduled':
      assertNumber(payload.attempt, 'retry.scheduled payload.attempt');
      assertString(payload.reason, 'retry.scheduled payload.reason');
      break;
    case 'warning.raised':
      assertString(payload.code, 'warning.raised payload.code');
      assertString(payload.summary, 'warning.raised payload.summary');
      break;
    case 'error.raised':
      assertString(payload.code, 'error.raised payload.code');
      assertString(payload.summary, 'error.raised payload.summary');
      break;
    default:
      break;
  }
}

export const assertCanonicalEvent = (value: unknown): asserts value is CanonicalEvent => {
  assertObject(value, 'Canonical event');

  assertString(value.eventId, 'eventId');
  assertString(value.runId, 'runId');
  assertString(value.turnId, 'turnId');
  assertString(value.sessionId, 'sessionId');
  assertString(value.type, 'type');

  if (!isCanonicalEventType(value.type)) {
    throw new Error(`Unsupported canonical event type: ${value.type}`);
  }

  assertNumber(value.ts, 'ts');
  assertNumber(value.seq, 'seq');
  assertObject(value.source, 'source');
  assertString(value.source.kind, 'source.kind');
  assertOptionalString(value.source.provider, 'source.provider');
  assertOptionalString(value.source.name, 'source.name');
  assertObject(value.payload, 'payload');

  validatePayloadForType(value.type, value.payload);
};
