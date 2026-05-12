import type {
  CanonicalEvent,
  CanonicalEventPayloadMap,
  CanonicalEventType,
  EventSource,
  RuntimeApprovalEventRecord,
  RuntimeAssistantTimelineEvent,
  RuntimeMessageRecord,
  RuntimeQuestionEventRecord,
  RuntimeSessionSnapshot,
  RuntimeToolCallRecord,
} from '@goodnight/runtime-protocol';

const DEFAULT_PROVIDER = 'built-in';

const summarizeText = (value: string | null | undefined, maxLength = 160) => {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
    : normalized;
};

const summarizeToolInput = (input: Record<string, unknown> | undefined) => {
  if (!input) {
    return '';
  }

  if (typeof input.command === 'string' && input.command.trim()) {
    return input.command.trim();
  }

  if (typeof input.path === 'string' && input.path.trim()) {
    return input.path.trim();
  }

  if (typeof input.file_path === 'string' && input.file_path.trim()) {
    return input.file_path.trim();
  }

  if (typeof input.url === 'string' && input.url.trim()) {
    return input.url.trim();
  }

  const serialized = JSON.stringify(input);
  return serialized === '{}' ? '' : summarizeText(serialized, 320);
};

const getDefaultSource = (
  type: CanonicalEventType,
  providerId: string,
  messageId: string,
  toolName?: string | null,
): EventSource => {
  if (type.startsWith('message.') || type.startsWith('reasoning.')) {
    return { kind: 'model', provider: providerId, name: 'assistant' };
  }

  if (type.startsWith('tool.')) {
    return { kind: 'tool', provider: providerId, name: toolName || 'tool' };
  }

  if (type === 'error.raised') {
    return { kind: 'runtime', provider: providerId, name: 'runtime-error' };
  }

  return { kind: 'runtime', provider: providerId, name: messageId };
};

type CreateRuntimeSidecarCanonicalEventInput<TType extends CanonicalEventType> = {
  sessionId: string;
  providerId?: string | null;
  runId: string;
  turnId?: string | null;
  messageId?: string | null;
  type: TType;
  payload: CanonicalEventPayloadMap[TType];
  ts: number;
  seq?: number;
  source?: EventSource;
  correlationId?: string | null;
  status?: CanonicalEvent['status'];
  providerMeta?: Record<string, unknown>;
};

export const createRuntimeSidecarCanonicalEvent = <TType extends CanonicalEventType>(
  input: CreateRuntimeSidecarCanonicalEventInput<TType>,
): Extract<CanonicalEvent, { type: TType }> =>
  ({
    eventId: `evt_sidecar_${input.runId}_${input.type.replace(/\./g, '_')}_${input.seq ?? input.ts}`,
    runId: input.runId,
    turnId: input.turnId || input.runId,
    sessionId: input.sessionId,
    messageId: input.messageId ?? input.runId,
    type: input.type,
    ts: input.ts,
    seq: input.seq ?? 0,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.status ? { status: input.status } : {}),
    source:
      input.source ||
      getDefaultSource(input.type, input.providerId || DEFAULT_PROVIDER, input.messageId || input.runId),
    payload: input.payload,
    ...(input.providerMeta ? { providerMeta: input.providerMeta } : {}),
  }) as Extract<CanonicalEvent, { type: TType }>;

const buildToolCompletedPayload = (
  event: Extract<RuntimeAssistantTimelineEvent, { kind: 'tool_result' }>,
) => ({
  toolCallId: event.toolCallId,
  ok: event.status === 'completed',
  summary: summarizeText(event.output) || `${event.toolName} completed`,
  outputText: event.output,
  fileChanges: event.fileChanges,
});

const appendApprovalEvents = (
  events: CanonicalEvent[],
  state: {
    sessionId: string;
    providerId: string;
    runId: string;
    seq: number;
  },
  approval: RuntimeApprovalEventRecord,
) => {
  events.push(
    createRuntimeSidecarCanonicalEvent({
      sessionId: state.sessionId,
      providerId: state.providerId,
      runId: state.runId,
      messageId: state.runId,
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
      seq: ++state.seq,
      correlationId: approval.approvalId,
    }),
  );

  if (approval.status === 'approved' || approval.status === 'denied') {
    events.push(
      createRuntimeSidecarCanonicalEvent({
        sessionId: state.sessionId,
        providerId: state.providerId,
        runId: state.runId,
        messageId: state.runId,
        type: 'approval.resolved',
        payload: {
          approvalId: approval.approvalId,
          resolution: approval.status,
        },
        ts: approval.resolvedAt ?? approval.createdAt,
        seq: ++state.seq,
        correlationId: approval.approvalId,
      }),
    );
  }
};

const appendQuestionEvents = (
  events: CanonicalEvent[],
  state: {
    sessionId: string;
    providerId: string;
    runId: string;
    seq: number;
  },
  question: RuntimeQuestionEventRecord,
) => {
  events.push(
    createRuntimeSidecarCanonicalEvent({
      sessionId: state.sessionId,
      providerId: state.providerId,
      runId: state.runId,
      messageId: state.runId,
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
      seq: ++state.seq,
      correlationId: question.questionId,
    }),
  );

  if (question.payload.status === 'answered' && question.payload.answers) {
    events.push(
      createRuntimeSidecarCanonicalEvent({
        sessionId: state.sessionId,
        providerId: state.providerId,
        runId: state.runId,
        messageId: state.runId,
        type: 'question.answered',
        payload: {
          questionId: question.questionId,
          answers: question.payload.answers,
        },
        ts: question.payload.answeredAt ?? question.createdAt,
        seq: ++state.seq,
        correlationId: question.questionId,
      }),
    );
  }
};

const getMessageStartTs = (message: RuntimeMessageRecord) =>
  Math.min(
    message.createdAt,
    ...((message.timeline || []).map((event) => event.createdAt)),
  );

const hasPendingUserInteraction = (timeline: RuntimeAssistantTimelineEvent[]) =>
  timeline.some(
    (event) =>
      (event.kind === 'approval' && event.status === 'pending') ||
      (event.kind === 'question' && event.payload.status === 'pending'),
  );

const getRunOutcome = (message: RuntimeMessageRecord, snapshotStatus?: RuntimeSessionSnapshot['status']) => {
  if (snapshotStatus === 'failed') {
    return 'failed' as const;
  }

  const timeline = message.timeline || [];
  if (timeline.some((event) => event.kind === 'error')) {
    return 'failed' as const;
  }

  if (message.content?.trim()) {
    return 'success' as const;
  }

  if (
    timeline.some(
      (event) =>
        (event.kind === 'tool_use' || event.kind === 'tool_result') &&
        (event.status === 'failed' || event.status === 'blocked'),
    )
  ) {
    return 'failed' as const;
  }

  return 'success' as const;
};

export const buildCanonicalEventsFromRuntimeMessages = (input: {
  sessionId: string;
  providerId?: string | null;
  messages: RuntimeMessageRecord[];
  snapshotStatus?: RuntimeSessionSnapshot['status'];
}) => {
  const providerId = input.providerId || DEFAULT_PROVIDER;
  const canonicalEvents: CanonicalEvent[] = [];

  input.messages
    .filter((message) => message.role === 'assistant')
    .forEach((message) => {
      const runId = message.id;
      const startTs = getMessageStartTs(message);
      const state = {
        sessionId: input.sessionId,
        providerId,
        runId,
        seq: 0,
      };

      canonicalEvents.push(
        createRuntimeSidecarCanonicalEvent({
          sessionId: input.sessionId,
          providerId,
          runId,
          messageId: message.id,
          type: 'run.started',
          payload: {
            providerId,
            threadId: input.sessionId,
            mode: 'agent',
          },
          ts: startTs,
          seq: ++state.seq,
        }),
      );
      canonicalEvents.push(
        createRuntimeSidecarCanonicalEvent({
          sessionId: input.sessionId,
          providerId,
          runId,
          messageId: message.id,
          type: 'message.started',
          payload: { role: 'assistant', phase: 'final_answer' },
          ts: startTs,
          seq: ++state.seq,
        }),
      );

      const orderedTimeline = [...(message.timeline || [])].sort(
        (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
      );
      for (const timelineEvent of orderedTimeline) {
        if (timelineEvent.kind === 'reasoning') {
          canonicalEvents.push(
            createRuntimeSidecarCanonicalEvent({
              sessionId: input.sessionId,
              providerId,
              runId,
              messageId: message.id,
              type: 'reasoning.started',
              payload: {},
              ts: timelineEvent.createdAt,
              seq: ++state.seq,
            }),
          );
          if (timelineEvent.content.trim()) {
            canonicalEvents.push(
              createRuntimeSidecarCanonicalEvent({
                sessionId: input.sessionId,
                providerId,
                runId,
                messageId: message.id,
                type: 'reasoning.delta',
                payload: {
                  textChunk: timelineEvent.content,
                },
                ts: timelineEvent.createdAt,
                seq: ++state.seq,
              }),
            );
          }
          if (timelineEvent.status === 'completed') {
            canonicalEvents.push(
              createRuntimeSidecarCanonicalEvent({
                sessionId: input.sessionId,
                providerId,
                runId,
                messageId: message.id,
                type: 'reasoning.completed',
                payload: {
                  finalText: timelineEvent.content,
                },
                ts: timelineEvent.createdAt,
                seq: ++state.seq,
              }),
            );
          }
          continue;
        }

        if (timelineEvent.kind === 'tool_use') {
          canonicalEvents.push(
            createRuntimeSidecarCanonicalEvent({
              sessionId: input.sessionId,
              providerId,
              runId,
              messageId: message.id,
              type: 'tool.started',
              payload: {
                toolCallId: timelineEvent.toolCallId,
                parentToolCallId: timelineEvent.parentToolCallId ?? null,
                toolName: timelineEvent.toolName,
                input: timelineEvent.input,
                inputSummary: summarizeToolInput(timelineEvent.input),
              },
              ts: timelineEvent.createdAt,
              seq: ++state.seq,
              correlationId: timelineEvent.toolCallId,
              source: { kind: 'tool', provider: providerId, name: timelineEvent.toolName },
            }),
          );

          if (
            timelineEvent.status !== 'running' &&
            !orderedTimeline.some(
              (event) => event.kind === 'tool_result' && event.toolCallId === timelineEvent.toolCallId,
            )
          ) {
            canonicalEvents.push(
              createRuntimeSidecarCanonicalEvent({
                sessionId: input.sessionId,
                providerId,
                runId,
                messageId: message.id,
                type: 'tool.completed',
                payload: {
                  toolCallId: timelineEvent.toolCallId,
                  ok: timelineEvent.status === 'completed',
                  summary: `${timelineEvent.toolName} ${timelineEvent.status}`,
                },
                ts: timelineEvent.createdAt,
                seq: ++state.seq,
                correlationId: timelineEvent.toolCallId,
                source: { kind: 'tool', provider: providerId, name: timelineEvent.toolName },
              }),
            );
          }
          continue;
        }

        if (timelineEvent.kind === 'tool_result') {
          canonicalEvents.push(
            createRuntimeSidecarCanonicalEvent({
              sessionId: input.sessionId,
              providerId,
              runId,
              messageId: message.id,
              type: 'tool.completed',
              payload: buildToolCompletedPayload(timelineEvent),
              ts: timelineEvent.createdAt,
              seq: ++state.seq,
              correlationId: timelineEvent.toolCallId,
              source: { kind: 'tool', provider: providerId, name: timelineEvent.toolName },
            }),
          );
          continue;
        }

        if (timelineEvent.kind === 'approval') {
          appendApprovalEvents(canonicalEvents, state, timelineEvent);
          continue;
        }

        if (timelineEvent.kind === 'question') {
          appendQuestionEvents(canonicalEvents, state, timelineEvent);
          continue;
        }

        if (timelineEvent.kind === 'error') {
          canonicalEvents.push(
            createRuntimeSidecarCanonicalEvent({
              sessionId: input.sessionId,
              providerId,
              runId,
              messageId: message.id,
              type: 'error.raised',
              payload: {
                code: 'runtime.sidecar.error',
                summary: timelineEvent.message,
                source: timelineEvent.source,
              },
              ts: timelineEvent.createdAt,
              seq: ++state.seq,
            }),
          );
        }
      }

      if (input.snapshotStatus !== 'running' && !hasPendingUserInteraction(orderedTimeline)) {
        const completionTs = Math.max(
          message.createdAt,
          ...orderedTimeline.map((event) => event.createdAt),
        );
        canonicalEvents.push(
          createRuntimeSidecarCanonicalEvent({
            sessionId: input.sessionId,
            providerId,
            runId,
            messageId: message.id,
            type: 'message.completed',
            payload: {
              finalText: message.content,
              phase: 'final_answer',
            },
            ts: completionTs,
            seq: ++state.seq,
          }),
        );
        canonicalEvents.push(
          createRuntimeSidecarCanonicalEvent({
            sessionId: input.sessionId,
            providerId,
            runId,
            messageId: message.id,
            type: 'run.completed',
            payload: {
              outcome: getRunOutcome(message, input.snapshotStatus),
              summary: summarizeText(message.content, 320) || undefined,
            },
            ts: completionTs,
            seq: ++state.seq,
          }),
        );
      }
    });

  return canonicalEvents.sort((left, right) =>
    left.runId === right.runId ? left.seq - right.seq || left.ts - right.ts : left.ts - right.ts,
  );
};

export const buildCanonicalEventsFromRuntimeSnapshot = (snapshot: RuntimeSessionSnapshot) =>
  buildCanonicalEventsFromRuntimeMessages({
    sessionId: snapshot.session.id,
    providerId: snapshot.session.providerId,
    messages: snapshot.messages,
    snapshotStatus: snapshot.status,
  });

export const buildRuntimeSidecarToolCompletedEvent = (input: {
  sessionId: string;
  providerId?: string | null;
  runId: string;
  messageId: string;
  toolCall: RuntimeToolCallRecord;
  ts: number;
}) =>
  createRuntimeSidecarCanonicalEvent({
    sessionId: input.sessionId,
    providerId: input.providerId,
    runId: input.runId,
    messageId: input.messageId,
    type: 'tool.completed',
    payload: {
      toolCallId: input.toolCall.id,
      ok: input.toolCall.status === 'completed',
      summary: summarizeText(input.toolCall.resultPreview) || `${input.toolCall.name} ${input.toolCall.status}`,
      outputText: input.toolCall.resultContent,
      fileChanges: input.toolCall.fileChanges,
    },
    ts: input.ts,
    correlationId: input.toolCall.id,
    source: {
      kind: 'tool',
      provider: input.providerId || DEFAULT_PROVIDER,
      name: input.toolCall.name,
    },
  });
