import type { TimelineProjection } from '../../modules/ai/runtime/composer/timelineComposerTypes.ts';
import {
  getAssistantTimelineText,
} from '../../modules/ai/store/assistantTimeline.ts';
import type { StoredChatMessage } from '../../modules/ai/store/aiChatStore.ts';
import type { AssistantDraftState } from './assistantRenderModel.ts';

const cloneReasoningMap = (value: Record<string, string> | undefined) => ({ ...(value || {}) });

export type AssistantStreamingDraftProjectionInput = {
  message: StoredChatMessage;
  projection: TimelineProjection | null;
  liveStreaming?: {
    messageId: string | null;
    text: string;
    updatedAt?: number | null;
  } | null;
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

  if (left.timeline !== right.timeline) {
    return false;
  }

  if (
    left.streamingText !== right.streamingText ||
    left.isStreaming !== right.isStreaming ||
    left.streamingStartedAt !== right.streamingStartedAt ||
    left.streamingUpdatedAt !== right.streamingUpdatedAt
  ) {
    return false;
  }

  const leftReasoning = left.streamingReasoningTextByEventId || {};
  const rightReasoning = right.streamingReasoningTextByEventId || {};
  const leftKeys = Object.keys(leftReasoning);
  const rightKeys = Object.keys(rightReasoning);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => leftReasoning[key] === rightReasoning[key]);
};

export const projectAssistantStreamingDraft = ({
  message,
  projection,
  liveStreaming,
  previousDraft,
}: AssistantStreamingDraftProjectionInput): AssistantStreamingDraftProjectionResult => {
  const canonicalTimeline =
    message.role === 'assistant' && Array.isArray(message.timeline) ? message.timeline : [];
  const timeline =
    canonicalTimeline.length > 0
      ? canonicalTimeline
      : previousDraft?.timeline || [];
  const visibleReasoningByEventId = cloneReasoningMap(previousDraft?.streamingReasoningTextByEventId);

  timeline.forEach((event) => {
    if (event.kind !== 'reasoning') {
      return;
    }

    if (event.status === 'streaming') {
      visibleReasoningByEventId[event.id] = event.content;
      return;
    }

    delete visibleReasoningByEventId[event.id];
  });

  const activeMessage = projection?.activeMessage ?? null;
  const directLiveStreaming =
    liveStreaming && liveStreaming.messageId === message.id
      ? liveStreaming
      : null;
  const timelineText = getAssistantTimelineText(timeline);
  const activeAnswerText =
    directLiveStreaming
      ? directLiveStreaming.text
      : activeMessage && activeMessage.text.trim().length > 0
      ? activeMessage.text
      : activeMessage
        ? timelineText
        : undefined;
  if (typeof activeAnswerText === 'string') {
    const draft: AssistantDraftState = {
      timeline,
      isStreaming: true,
      streamingStartedAt: activeMessage?.startedAt,
      streamingUpdatedAt: directLiveStreaming?.updatedAt ?? activeMessage?.updatedAt,
    };
    draft.streamingText = activeAnswerText;
    if (Object.keys(visibleReasoningByEventId).length > 0) {
      draft.streamingReasoningTextByEventId = visibleReasoningByEventId;
    }

    return {
      draft,
    };
  }

  const draft: AssistantDraftState = {
    timeline,
    isStreaming: false,
  };

  if (Object.keys(visibleReasoningByEventId).length > 0) {
    draft.streamingReasoningTextByEventId = visibleReasoningByEventId;
  }

  if (!draft.streamingText && !draft.streamingReasoningTextByEventId) {
    return {
      draft: null,
    };
  }

  return {
    draft,
  };
};
