import type { RuntimeToolStep } from '../runtime/agent-kernel/agentKernelTypes.ts';
import type { AgentStoredRuntimeEvent } from '../runtime/dispatch/agentEvents.ts';
import {
  mapRuntimeEvents,
  syncRuntimeEventsWithToolCalls,
  upsertRuntimeApprovalEvent,
  upsertRuntimeQuestionEvent,
  upsertRuntimeToolResultEvent,
  upsertRuntimeToolUseEvent,
} from '../runtime/dispatch/agentEvents.ts';
import {
  buildAssistantStructuredContentState,
  type AIChatMessagePart,
} from '../../../components/workspace/aiChatMessageParts.ts';

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

export type StoredChatRuntimeFileChange = {
  path: string;
  beforeContent: string | null;
  afterContent: string | null;
};

export type StoredChatRuntimeApprovalDisplay = {
  toolName?: string | null;
  command?: string | null;
  filePath?: string | null;
  oldString?: string | null;
  newString?: string | null;
  content?: string | null;
  inputJson?: string | null;
};

export type AssistantTimelineTextEvent = {
  id: string;
  kind: 'text';
  content: string;
  createdAt: number;
};

export type AssistantTimelineReasoningEvent = {
  id: string;
  kind: 'reasoning';
  content: string;
  collapsed: boolean;
  status: 'streaming' | 'completed';
  elapsedSeconds?: number;
  createdAt: number;
};

export type AssistantTimelineErrorEvent = {
  id: string;
  kind: 'error';
  message: string;
  source?: 'runtime' | 'tool' | 'provider';
  createdAt: number;
};

export type StoredChatRuntimeEvent = AgentStoredRuntimeEvent<
  StoredChatRuntimeApprovalDisplay,
  RuntimeQuestionPayload
> & {
  fileChanges?: StoredChatRuntimeFileChange[];
};

export type AssistantTimelineEvent =
  | AssistantTimelineTextEvent
  | AssistantTimelineReasoningEvent
  | AssistantTimelineErrorEvent
  | StoredChatRuntimeEvent;

type AssistantNarrativeTimelineEvent =
  | AssistantTimelineTextEvent
  | AssistantTimelineReasoningEvent;

const createTimelineEventId = (kind: AssistantTimelineEvent['kind'], index = 0) =>
  `assistant-timeline_${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${index}`;

export const isAssistantRuntimeTimelineEvent = (
  event: AssistantTimelineEvent
): event is StoredChatRuntimeEvent =>
  event.kind === 'tool_use' ||
  event.kind === 'tool_result' ||
  event.kind === 'approval' ||
  event.kind === 'question';

const isAssistantNarrativeTimelineEvent = (
  event: AssistantTimelineEvent
): event is AssistantNarrativeTimelineEvent =>
  event.kind === 'text' || event.kind === 'reasoning';

const normalizeAssistantTimeline = (timeline: AssistantTimelineEvent[] | unknown): AssistantTimelineEvent[] =>
  Array.isArray(timeline) ? timeline : [];

const sortAssistantTimelineEvents = (timeline: AssistantTimelineEvent[] = []) =>
  [...timeline].sort((left, right) => left.createdAt - right.createdAt);

const sortAssistantTimelineEntries = (
  entries: Array<{
    event: AssistantTimelineEvent;
    orderHint: number;
    arrayIndex: number;
  }>
) =>
  [...entries].sort((left, right) => {
    if (left.event.createdAt !== right.event.createdAt) {
      return left.event.createdAt - right.event.createdAt;
    }

    if (left.orderHint !== right.orderHint) {
      return left.orderHint - right.orderHint;
    }

    return left.arrayIndex - right.arrayIndex;
  });

const MIN_VALID_EPOCH_SECONDS = 946684800;
const MIN_VALID_EPOCH_MILLISECONDS = MIN_VALID_EPOCH_SECONDS * 1000;
const MAX_REASONABLE_ELAPSED_SECONDS = 60 * 60 * 24 * 365;

const normalizeEpochMilliseconds = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  if (value >= MIN_VALID_EPOCH_MILLISECONDS) {
    return value;
  }

  if (value >= MIN_VALID_EPOCH_SECONDS) {
    return value * 1000;
  }

  return null;
};

const normalizeElapsedSeconds = (value: number | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  if (value > MAX_REASONABLE_ELAPSED_SECONDS) {
    return undefined;
  }

  return Math.max(0.1, value);
};

const resolveElapsedSeconds = (startedAt: number, referenceTime: number) => {
  const normalizedStartedAt = normalizeEpochMilliseconds(startedAt);
  const normalizedReferenceTime = normalizeEpochMilliseconds(referenceTime);
  if (normalizedStartedAt === null || normalizedReferenceTime === null) {
    return undefined;
  }

  const elapsedMs = Math.max(0, normalizedReferenceTime - normalizedStartedAt);
  return Math.max(0.1, Math.round(elapsedMs / 100) / 10);
};

export const buildAssistantTimelineFromParts = (
  parts: AIChatMessagePart[],
  options?: { createdAt?: number }
): AssistantTimelineEvent[] => {
  const baseTime = options?.createdAt ?? Date.now();
  return parts.flatMap((part, index): AssistantTimelineEvent[] => {
    const createdAt = part.createdAt ?? baseTime + index;

    if (part.type === 'thinking' && part.content.trim()) {
      return [
        {
          id: createTimelineEventId('reasoning', index),
          kind: 'reasoning',
          content: part.content,
          collapsed: part.collapsed,
          status: part.status ?? 'completed',
          elapsedSeconds: normalizeElapsedSeconds(part.elapsedSeconds),
          createdAt,
        },
      ];
    }

    if (part.type === 'text' && part.content.trim()) {
      return [
        {
          id: createTimelineEventId('text', index),
          kind: 'text',
          content: part.content,
          createdAt,
        },
      ];
    }

    return [];
  });
};

export const buildAssistantTimelineFromContent = (
  content: string,
  options?: {
    fallbackThinkingContent?: string;
    preferredAssistantParts?: AIChatMessagePart[];
    thinkingCollapsed?: boolean;
    createdAt?: number;
  }
): AssistantTimelineEvent[] => {
  const structured = buildAssistantStructuredContentState({
    content,
    fallbackThinkingContent: options?.fallbackThinkingContent,
    preferredAssistantParts: options?.preferredAssistantParts,
    thinkingCollapsed: options?.thinkingCollapsed ?? true,
  });

  return buildAssistantTimelineFromParts(structured.assistantParts, {
    createdAt: options?.createdAt,
  });
};

export const buildAssistantTimelineUpdate = (
  content: string,
  currentTimeline: AssistantTimelineEvent[] = [],
  options?: {
    fallbackThinkingContent?: string;
    preferredAssistantParts?: AIChatMessagePart[];
    thinkingCollapsed?: boolean;
  }
) => {
  const normalizedTimeline = normalizeAssistantTimeline(currentTimeline);
  const runtimeEvents = normalizedTimeline.filter(isAssistantRuntimeTimelineEvent);
  const existingNarrativeEvents = normalizedTimeline.filter(isAssistantNarrativeTimelineEvent);
  const nextNarrativeEvents = buildAssistantTimelineFromContent(content, options);
  const hasExplicitPreferredNarrativeTimestamps = Boolean(
    options?.preferredAssistantParts?.some((part) => typeof part.createdAt === 'number')
  );
  const existingOrderById = new Map(normalizedTimeline.map((event, index) => [event.id, index] as const));
  const narrativeCreatedAtBuckets = {
    text: existingNarrativeEvents.filter(
      (event): event is AssistantTimelineTextEvent => event.kind === 'text'
    ),
    reasoning: existingNarrativeEvents.filter(
      (event): event is AssistantTimelineReasoningEvent => event.kind === 'reasoning'
    ),
  };
  let nextCreatedAt =
    normalizedTimeline.reduce((maxCreatedAt, event) => Math.max(maxCreatedAt, event.createdAt), 0) + 1;
  let nextOrderHint = normalizedTimeline.length;
  let textIndex = 0;
  let reasoningIndex = 0;
  const timelineEntries = nextNarrativeEvents.map((event, index) => {
    if (event.kind === 'text') {
      const reusedTextEvent = narrativeCreatedAtBuckets.text[textIndex];
      textIndex += 1;
      const nextEvent = {
        ...event,
        createdAt:
          hasExplicitPreferredNarrativeTimestamps && typeof event.createdAt === 'number'
            ? event.createdAt
            : typeof reusedTextEvent?.createdAt === 'number'
              ? reusedTextEvent.createdAt
              : typeof event.createdAt === 'number'
                ? event.createdAt
                : nextCreatedAt++,
      };
      return {
        event: nextEvent,
        orderHint:
          typeof reusedTextEvent?.id === 'string'
            ? (existingOrderById.get(reusedTextEvent.id) ?? nextOrderHint++)
            : nextOrderHint++,
        arrayIndex: index,
      };
    }

    if (event.kind === 'reasoning') {
      const reusedReasoningEvent = narrativeCreatedAtBuckets.reasoning[reasoningIndex];
      reasoningIndex += 1;
      const nextEvent = {
        ...event,
        createdAt:
          hasExplicitPreferredNarrativeTimestamps && typeof event.createdAt === 'number'
            ? event.createdAt
            : typeof reusedReasoningEvent?.createdAt === 'number'
              ? reusedReasoningEvent.createdAt
              : nextCreatedAt++,
        status: event.status ?? reusedReasoningEvent?.status ?? 'completed',
        elapsedSeconds:
          normalizeElapsedSeconds(event.elapsedSeconds) ??
          normalizeElapsedSeconds(reusedReasoningEvent?.elapsedSeconds),
      };
      return {
        event: nextEvent,
        orderHint:
          typeof reusedReasoningEvent?.id === 'string'
            ? (existingOrderById.get(reusedReasoningEvent.id) ?? nextOrderHint++)
            : nextOrderHint++,
        arrayIndex: index,
      };
    }

    return {
      event,
      orderHint: nextOrderHint++,
      arrayIndex: index,
    };
  });
  const runtimeEntries = runtimeEvents.map((event, index) => ({
    event,
    orderHint: existingOrderById.get(event.id) ?? nextOrderHint++,
    arrayIndex: timelineEntries.length + index,
  }));
  return sortAssistantTimelineEntries([...timelineEntries, ...runtimeEntries]).map(
    ({ event }) => event
  );
};

export const getAssistantTimelineText = (timeline: AssistantTimelineEvent[] = []) =>
  normalizeAssistantTimeline(timeline)
    .filter((event): event is AssistantTimelineTextEvent => event.kind === 'text')
    .map((event) => event.content.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

export const getAssistantTimelineReasoning = (timeline: AssistantTimelineEvent[] = []) =>
  normalizeAssistantTimeline(timeline)
    .filter((event): event is AssistantTimelineReasoningEvent => event.kind === 'reasoning')
    .map((event) => event.content.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

export const getAssistantRuntimeTimelineEvents = (timeline: AssistantTimelineEvent[] = []) =>
  normalizeAssistantTimeline(timeline).filter(isAssistantRuntimeTimelineEvent);

export const replaceAssistantRuntimeTimelineEvents = (
  timeline: AssistantTimelineEvent[] = [],
  runtimeEvents: StoredChatRuntimeEvent[]
) =>
  sortAssistantTimelineEvents([
    ...normalizeAssistantTimeline(timeline).filter((event) => !isAssistantRuntimeTimelineEvent(event)),
    ...runtimeEvents,
  ]);

export const appendAssistantRuntimeTimelineEvent = (
  timeline: AssistantTimelineEvent[] = [],
  runtimeEvent: StoredChatRuntimeEvent
) =>
  replaceAssistantRuntimeTimelineEvents(timeline, [
    ...getAssistantRuntimeTimelineEvents(timeline),
    runtimeEvent,
  ]);

export const mapAssistantRuntimeTimelineEvents = (
  timeline: AssistantTimelineEvent[] = [],
  matcher: (event: StoredChatRuntimeEvent) => boolean,
  updater: (event: StoredChatRuntimeEvent) => StoredChatRuntimeEvent
) =>
  replaceAssistantRuntimeTimelineEvents(
    timeline,
    mapRuntimeEvents(getAssistantRuntimeTimelineEvents(timeline), matcher, updater)
  );

export const upsertAssistantRuntimeToolUseEvent = (
  timeline: AssistantTimelineEvent[] = [],
  input: {
    toolCallId: string;
    parentToolCallId?: string | null;
    toolName: string;
    toolInput: Record<string, unknown>;
    status: RuntimeToolStep['status'];
  }
) =>
  replaceAssistantRuntimeTimelineEvents(
    timeline,
    upsertRuntimeToolUseEvent(getAssistantRuntimeTimelineEvents(timeline), input)
  );

export const upsertAssistantRuntimeToolResultEvent = (
  timeline: AssistantTimelineEvent[] = [],
  input: {
    toolCallId: string;
    parentToolCallId?: string | null;
    toolName: string;
    status: RuntimeToolStep['status'];
    output: string;
    fileChanges?: Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges'];
  }
) =>
  replaceAssistantRuntimeTimelineEvents(
    timeline,
    upsertRuntimeToolResultEvent(getAssistantRuntimeTimelineEvents(timeline), input)
  );

export const upsertAssistantRuntimeApprovalEvent = (
  timeline: AssistantTimelineEvent[] = [],
  event: Extract<StoredChatRuntimeEvent, { kind: 'approval' }>
) =>
  replaceAssistantRuntimeTimelineEvents(
    timeline,
    upsertRuntimeApprovalEvent(getAssistantRuntimeTimelineEvents(timeline), event)
  );

export const upsertAssistantRuntimeQuestionEvent = (
  timeline: AssistantTimelineEvent[] = [],
  event: Extract<StoredChatRuntimeEvent, { kind: 'question' }>
) =>
  replaceAssistantRuntimeTimelineEvents(
    timeline,
    upsertRuntimeQuestionEvent(getAssistantRuntimeTimelineEvents(timeline), event)
  );

export const answerAssistantRuntimeQuestionEvent = (
  timeline: AssistantTimelineEvent[] = [],
  questionId: string,
  answers: Record<string, string>
) =>
  mapAssistantRuntimeTimelineEvents(
    timeline,
    (event) => event.kind === 'question' && event.questionId === questionId,
    (event) =>
      event.kind === 'question'
        ? {
            ...event,
            payload: {
              ...event.payload,
              status: 'answered',
              answers,
            },
          }
        : event
  );

export const buildAssistantStreamingTimeline = (
  content: string,
  currentTimeline: AssistantTimelineEvent[] = [],
  options?: {
    fallbackThinkingContent?: string;
    preferredAssistantParts?: AIChatMessagePart[];
    thinkingCollapsed?: boolean;
  }
) => buildAssistantTimelineUpdate(content, currentTimeline, options);

export const applyAssistantReasoningProgress = (
  timeline: AssistantTimelineEvent[] = [],
  input: {
    active: boolean;
    referenceTime?: number;
  }
): AssistantTimelineEvent[] => {
  const normalizedTimeline = normalizeAssistantTimeline(timeline);
  let latestReasoningIndex = -1;
  normalizedTimeline.forEach((event, index) => {
    if (event.kind === 'reasoning') {
      latestReasoningIndex = index;
    }
  });

  if (latestReasoningIndex === -1) {
    return normalizedTimeline;
  }

  const resolveReasoningElapsedSeconds = (event: AssistantTimelineReasoningEvent) => {
    const storedElapsedSeconds = normalizeElapsedSeconds(event.elapsedSeconds);
    if (typeof input.referenceTime === 'number') {
      const elapsedSeconds = resolveElapsedSeconds(event.createdAt, input.referenceTime);
      if (typeof elapsedSeconds === 'number') {
        return Math.max(elapsedSeconds, storedElapsedSeconds ?? elapsedSeconds);
      }
    }

    return storedElapsedSeconds;
  };

  return normalizedTimeline.map((event, index): AssistantTimelineEvent => {
    if (event.kind !== 'reasoning') {
      return event;
    }

    const isLatestReasoning = index === latestReasoningIndex;
    const status: AssistantTimelineReasoningEvent['status'] =
      isLatestReasoning && input.active ? 'streaming' : 'completed';
    const nextElapsedSeconds = isLatestReasoning
      ? input.active
        ? resolveReasoningElapsedSeconds(event)
        : event.status === 'streaming' || typeof event.elapsedSeconds !== 'number'
          ? resolveReasoningElapsedSeconds(event)
          : event.elapsedSeconds
      : event.elapsedSeconds;
    return {
      ...event,
      status,
      elapsedSeconds:
        typeof nextElapsedSeconds === 'number' ? Math.max(0.1, nextElapsedSeconds) : undefined,
    };
  });
};

export const syncAssistantTimelineWithToolCalls = (
  timeline: AssistantTimelineEvent[] = [],
  toolCalls: RuntimeToolStep[]
) =>
  replaceAssistantRuntimeTimelineEvents(
    timeline,
    syncRuntimeEventsWithToolCalls(getAssistantRuntimeTimelineEvents(timeline), toolCalls)
  );
