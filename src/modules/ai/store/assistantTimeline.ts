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
  const runtimeEvents = currentTimeline.filter(isAssistantRuntimeTimelineEvent);
  const existingNarrativeEvents = currentTimeline.filter(isAssistantNarrativeTimelineEvent);
  const nextNarrativeEvents = buildAssistantTimelineFromContent(content, options);
  const shouldPreferExplicitNarrativeTimestamps = Boolean(
    options?.preferredAssistantParts?.some((part) => typeof part.createdAt === 'number')
  );
  const narrativeCreatedAtBuckets = {
    text: existingNarrativeEvents
      .filter((event): event is AssistantTimelineTextEvent => event.kind === 'text')
      .map((event) => event.createdAt),
    reasoning: existingNarrativeEvents
      .filter((event): event is AssistantTimelineReasoningEvent => event.kind === 'reasoning')
      .map((event) => event.createdAt),
  };
  let nextCreatedAt =
    currentTimeline.reduce((maxCreatedAt, event) => Math.max(maxCreatedAt, event.createdAt), 0) + 1;
  let textIndex = 0;
  let reasoningIndex = 0;
  const textEvents = nextNarrativeEvents.map((event) => {
    if (event.kind === 'text') {
      const reusedCreatedAt = narrativeCreatedAtBuckets.text[textIndex];
      textIndex += 1;
      return {
        ...event,
        createdAt:
          shouldPreferExplicitNarrativeTimestamps && typeof event.createdAt === 'number'
            ? event.createdAt
            : typeof reusedCreatedAt === 'number'
              ? reusedCreatedAt
              : nextCreatedAt++,
      };
    }

    if (event.kind === 'reasoning') {
      const reusedCreatedAt = narrativeCreatedAtBuckets.reasoning[reasoningIndex];
      reasoningIndex += 1;
      return {
        ...event,
        createdAt:
          shouldPreferExplicitNarrativeTimestamps && typeof event.createdAt === 'number'
            ? event.createdAt
            : typeof reusedCreatedAt === 'number'
              ? reusedCreatedAt
              : nextCreatedAt++,
      };
    }

    return event;
  });
  return [...textEvents, ...runtimeEvents].sort((left, right) => left.createdAt - right.createdAt);
};

export const getAssistantTimelineText = (timeline: AssistantTimelineEvent[] = []) =>
  timeline
    .filter((event): event is AssistantTimelineTextEvent => event.kind === 'text')
    .map((event) => event.content.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

export const getAssistantTimelineReasoning = (timeline: AssistantTimelineEvent[] = []) =>
  timeline
    .filter((event): event is AssistantTimelineReasoningEvent => event.kind === 'reasoning')
    .map((event) => event.content.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

export const getAssistantRuntimeTimelineEvents = (timeline: AssistantTimelineEvent[] = []) =>
  timeline.filter(isAssistantRuntimeTimelineEvent);

export const replaceAssistantRuntimeTimelineEvents = (
  timeline: AssistantTimelineEvent[] = [],
  runtimeEvents: StoredChatRuntimeEvent[]
) =>
  [...timeline.filter((event) => !isAssistantRuntimeTimelineEvent(event)), ...runtimeEvents].sort(
    (left, right) => left.createdAt - right.createdAt
  );

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

export const syncAssistantTimelineWithToolCalls = (
  timeline: AssistantTimelineEvent[] = [],
  toolCalls: RuntimeToolStep[]
) =>
  replaceAssistantRuntimeTimelineEvents(
    timeline,
    syncRuntimeEventsWithToolCalls(getAssistantRuntimeTimelineEvents(timeline), toolCalls)
  );
