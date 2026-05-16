// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { TimelineProjection } from '../../modules/ai/runtime/composer/timelineComposerTypes.ts';
import {
  type AssistantTimelineEvent,
} from '../../modules/ai/store/assistantTimeline.ts';
import type { StoredChatMessage } from '../../modules/ai/store/aiChatStore.ts';
import type { AssistantDraftState } from './assistantRenderModel.ts';

const sortTimeline = (timeline: AssistantTimelineEvent[]) =>
  [...timeline].sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));

const areTimelineEventsEqual = (
  left: AssistantTimelineEvent[],
  right: AssistantTimelineEvent[],
) => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((event, index) => JSON.stringify(event) === JSON.stringify(right[index]));
};

const buildProjectionNarrativeTimeline = (
  message: StoredChatMessage,
  projection: TimelineProjection,
  fallbackTimeline: AssistantTimelineEvent[],
) => {
  const nonNarrativeEvents = fallbackTimeline.filter(
    (event) => event.kind !== 'text' && event.kind !== 'reasoning',
  );
  const stableTextEvents = fallbackTimeline.filter(
    (event): event is Extract<AssistantTimelineEvent, { kind: 'text' }> => event.kind === 'text',
  );
  const preservedTextEvents =
    stableTextEvents.length > 1 ? stableTextEvents.slice(0, -1) : [];
  const stableLatestTextEvent =
    stableTextEvents.length > 0 ? stableTextEvents[stableTextEvents.length - 1]! : null;
  const stableReasoningEvents = fallbackTimeline.filter(
    (event): event is Extract<AssistantTimelineEvent, { kind: 'reasoning' }> => event.kind === 'reasoning',
  );
  const reasoningEvents: Extract<AssistantTimelineEvent, { kind: 'reasoning' }>[] = [];
  let activeReasoning: Extract<AssistantTimelineEvent, { kind: 'reasoning' }> | null = null;
  let reasoningIndex = 0;

  const openReasoning = (createdAt: number) => {
    if (activeReasoning) {
      return activeReasoning;
    }

    const reused = stableReasoningEvents[reasoningIndex];
    activeReasoning = {
      id: reused?.id || `${message.id}-projection-reasoning-${reasoningIndex}`,
      kind: 'reasoning',
      content: reused?.content || '',
      collapsed: reused?.collapsed ?? true,
      status: 'streaming',
      elapsedSeconds: reused?.elapsedSeconds,
      createdAt: reused?.createdAt ?? createdAt,
    };
    reasoningIndex += 1;
    return activeReasoning;
  };

  projection.events.forEach((event) => {
    if (event.type === 'reasoning.started') {
      openReasoning(event.ts);
      return;
    }

    if (event.type === 'reasoning.delta') {
      const reasoning = openReasoning(event.ts);
      reasoning.content = event.payload.textChunk;
      reasoning.status = 'streaming';
      return;
    }

    if (event.type === 'reasoning.completed') {
      const reasoning = openReasoning(event.ts);
      reasoning.content = event.payload.finalText || event.payload.summary || reasoning.content;
      reasoning.status = 'completed';
      reasoningEvents.push(reasoning);
      activeReasoning = null;
    }
  });

  if (activeReasoning) {
    reasoningEvents.push(activeReasoning);
  }

  const projectionText = projection.activeMessage?.text || projection.finalMessage?.text || '';
  const stableText = stableLatestTextEvent?.content || '';
  const shouldUseProjectionText =
    projectionText.trim().length > 0
      && (projection.activeMessage !== null || stableText.trim() !== projectionText.trim());
  const textEvent = shouldUseProjectionText
    ? ({
        id: stableLatestTextEvent?.id || `${message.id}-projection-text`,
        kind: 'text',
        content: projectionText,
        createdAt:
          projection.activeMessage?.startedAt
          || projection.finalMessage?.completedAt
          || stableLatestTextEvent?.createdAt
          || message.createdAt,
      } satisfies Extract<AssistantTimelineEvent, { kind: 'text' }>)
    : stableLatestTextEvent || null;

  return sortTimeline([
    ...nonNarrativeEvents,
    ...reasoningEvents,
    ...preservedTextEvents,
    ...(textEvent ? [textEvent] : []),
  ]);
};

export type AssistantStreamingDraftProjectionInput = {
  message: StoredChatMessage;
  projection: TimelineProjection | null;
  previousDraft?: AssistantDraftState;
};

export type AssistantStreamingDraftProjectionResult = {
  draft: AssistantDraftState | null;
};

export const areAssistantDraftStatesEqual = (
  left: AssistantDraftState | undefined,
  right: AssistantDraftState | undefined,
) => {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  if (!areTimelineEventsEqual(left.timeline, right.timeline)) {
    return false;
  }

  return (
    left.isStreaming === right.isStreaming
    && left.streamingStartedAt === right.streamingStartedAt
    && left.streamingUpdatedAt === right.streamingUpdatedAt
  );
};

export const projectAssistantStreamingDraft = ({
  message,
  projection,
  previousDraft,
}: AssistantStreamingDraftProjectionInput): AssistantStreamingDraftProjectionResult => {
  const canonicalTimeline =
    message.role === 'assistant' && Array.isArray(message.timeline) ? message.timeline : [];
  const fallbackTimeline =
    canonicalTimeline.length > 0
      ? canonicalTimeline
      : previousDraft?.timeline || [];
  const timeline = projection
    ? buildProjectionNarrativeTimeline(message, projection, fallbackTimeline)
    : fallbackTimeline;
  const latestTimelineText = [...timeline]
    .reverse()
    .find((event): event is Extract<AssistantTimelineEvent, { kind: 'text' }> => event.kind === 'text')
    ?.content
    .trim() || '';
  const hasStreamingReasoning = timeline.some(
    (event) => event.kind === 'reasoning' && event.status === 'streaming',
  );
  const shouldKeepDraftVisible =
    Boolean(projection?.activeMessage)
    || hasStreamingReasoning
    || Boolean(
      projection?.finalMessage
      && projection.finalMessage.text.trim()
      && projection.finalMessage.text.trim() !== latestTimelineText,
    );

  if (!shouldKeepDraftVisible) {
    return {
      draft: null,
    };
  }

  return {
    draft: {
      timeline,
      isStreaming: true,
      streamingStartedAt:
        projection?.activeMessage?.startedAt
        || projection?.finalMessage?.completedAt,
      streamingUpdatedAt:
        projection?.activeMessage?.updatedAt
        || projection?.finalMessage?.completedAt,
    },
  };
};
