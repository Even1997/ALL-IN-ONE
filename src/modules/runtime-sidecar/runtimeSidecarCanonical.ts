// 文件作用：canonical 映射层，位于runtime sidecar 桥接层。
// 所在链路：负责把 sidecar 事件、快照与前端多个 store 接起来。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件负责把 sidecar snapshot 与 assistant timeline 统一映射成 canonical runtime events。
// 它处在 provider / sidecar 原始输出 与 timeline composer 之间，是运行时事实标准化的关键桥接层。
// 如果你在排查“后端事件明明到了，但前端 timeline / render model 没反应”，通常先看这里有没有把事实正确翻译出来。
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

// 这一层负责把 sidecar snapshot / assistant timeline 统一翻译成 canonical runtime events。
// 如果你在排查“后端明明有事件，但前端 timeline / render model 没显示出来”，
// 一般先看这里是否把原始事实完整映射到了 canonical 事件层。
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

// canonical event 需要标记“这条事实来自谁”。
// 这里给没有显式 source 的事件补一个稳定默认值，方便后续 projection / UI 按来源分组。
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

// 这是 sidecar -> canonical 的最小构造器。
// 后面无论是 snapshot 全量重建，还是单个 tool 结果补事件，都会走这里保持字段一致。
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

// tool_result 在 assistant timeline 里更偏“原始记录”，
// 这里把它压成 canonical tool.completed 所需的摘要结构。
const buildToolCompletedPayload = (
  event: Extract<RuntimeAssistantTimelineEvent, { kind: 'tool_result' }>,
) => ({
  toolCallId: event.toolCallId,
  ok: event.status === 'completed',
  summary: summarizeText(event.output) || `${event.toolName} completed`,
  outputText: event.output,
  fileChanges: event.fileChanges,
});

// approval 在 runtime truth 里可能经历“请求 -> 解决”两个阶段，
// 这里拆成两条 canonical 事件，后续 approval store 和 UI 可以按生命周期消费。
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

// question 事件和 approval 类似，也是一个需要跨时刻闭环的交互事实。
// 这里保证 sidecar 快照里的“已提问 / 已回答”都能重建成明确事件。
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

// assistant message 的 run.started 时间要覆盖 timeline 里更早的 reasoning / tool 片段，
// 否则重放时会出现“消息先开始还是工具先开始”顺序错乱。
const getMessageStartTs = (message: RuntimeMessageRecord) =>
  Math.min(
    message.createdAt,
    ...((message.timeline || []).map((event) => event.createdAt)),
  );

// 只要还有待批准或待回答的问题，这个 run 就不能被视为真正完成。
const hasPendingUserInteraction = (timeline: RuntimeAssistantTimelineEvent[]) =>
  timeline.some(
    (event) =>
      (event.kind === 'approval' && event.status === 'pending') ||
      (event.kind === 'question' && event.payload.status === 'pending'),
  );

// run outcome 是给 replay / lifecycle / 已完成状态做归类用的粗粒度结论。
// 这里不要掺杂 UI 展示偏好，只根据 runtime 事实判断 success / failed。
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
