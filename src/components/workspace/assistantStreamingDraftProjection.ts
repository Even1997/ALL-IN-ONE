import type { TimelineProjection } from '../../modules/ai/runtime/composer/timelineComposerTypes.ts';
import {
  getAssistantTimelineText,
  type AssistantTimelineEvent,
} from '../../modules/ai/store/assistantTimeline.ts';
import type { StoredChatMessage } from '../../modules/ai/store/aiChatStore.ts';
import type { AssistantDraftState } from './assistantRenderModel.ts';
import {
  advanceParagraphStreamingState,
  createParagraphStreamingState,
  finalizeParagraphStreamingState,
  type ParagraphStreamingState,
} from './assistantParagraphStreaming.ts';

export const resolveAssistantCompletionText = (
  projectionFinalText: string | undefined,
  timeline: AssistantTimelineEvent[],
) => {
  const projected = projectionFinalText?.trim();
  if (projected) {
    return projectionFinalText || '';
  }

  return getAssistantTimelineText(timeline);
};

const hasOwn = <T extends object>(value: T | undefined, key: keyof T) =>
  Boolean(value && Object.prototype.hasOwnProperty.call(value, key));

const cloneReasoningMap = (value: Record<string, string> | undefined) => ({ ...(value || {}) });

export type AssistantStreamingDraftProjectionInput = {
  message: StoredChatMessage;
  projection: TimelineProjection | null;
  previousDraft?: AssistantDraftState;
  answerState?: ParagraphStreamingState | null;
  reasoningStateByEventId?: Record<string, ParagraphStreamingState>;
  now: number;
};

export type AssistantStreamingDraftProjectionResult = {
  draft: AssistantDraftState | null;
  answerState: ParagraphStreamingState | null;
  reasoningStateByEventId: Record<string, ParagraphStreamingState>;
  pendingAnswerFlush: boolean;
  pendingReasoningFlushEventIds: string[];
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

  if (left.streamingText !== right.streamingText || left.isStreaming !== right.isStreaming) {
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
  previousDraft,
  answerState,
  reasoningStateByEventId = {},
  now,
}: AssistantStreamingDraftProjectionInput): AssistantStreamingDraftProjectionResult => {
  const timeline =
    previousDraft?.timeline && previousDraft.timeline.length > 0
      ? previousDraft.timeline
      : message.role === 'assistant' && Array.isArray(message.timeline)
        ? message.timeline
        : [];
  const draft: AssistantDraftState = {
    timeline,
    isStreaming: false,
  };
  const nextReasoningStates: Record<string, ParagraphStreamingState> = {};
  const visibleReasoningByEventId = cloneReasoningMap(previousDraft?.streamingReasoningTextByEventId);
  const pendingReasoningFlushEventIds: string[] = [];

  timeline.forEach((event) => {
    if (event.kind !== 'reasoning') {
      return;
    }

    if (event.status === 'streaming') {
      const currentState = reasoningStateByEventId[event.id] ?? createParagraphStreamingState();
      const nextState = advanceParagraphStreamingState(currentState, event.content, now);
      nextReasoningStates[event.id] = nextState;
      visibleReasoningByEventId[event.id] = nextState.visibleText;

      if (nextState.pendingText.trim().length > 0) {
        pendingReasoningFlushEventIds.push(event.id);
      }
      return;
    }

    const currentState = reasoningStateByEventId[event.id];
    if (!currentState) {
      delete visibleReasoningByEventId[event.id];
      return;
    }

    const finalized = finalizeParagraphStreamingState(currentState, event.content);
    nextReasoningStates[event.id] = finalized;
    delete visibleReasoningByEventId[event.id];
  });

  const activeAnswerText = projection?.activeMessage?.text;
  if (typeof activeAnswerText === 'string') {
    const currentAnswerState = answerState ?? createParagraphStreamingState();
    const nextAnswerState = advanceParagraphStreamingState(currentAnswerState, activeAnswerText, now);
    draft.isStreaming = true;
    draft.streamingText = nextAnswerState.visibleText;
    if (Object.keys(visibleReasoningByEventId).length > 0) {
      draft.streamingReasoningTextByEventId = visibleReasoningByEventId;
    }

    return {
      draft,
      answerState: nextAnswerState,
      reasoningStateByEventId: nextReasoningStates,
      pendingAnswerFlush: nextAnswerState.pendingText.trim().length > 0,
      pendingReasoningFlushEventIds,
    };
  }

  const finalText = resolveAssistantCompletionText(projection?.finalMessage?.text, timeline);
  const finalizedAnswerState = hasOwn(previousDraft, 'streamingText') || answerState
    ? finalizeParagraphStreamingState(answerState ?? createParagraphStreamingState(), finalText)
    : null;

  if (hasOwn(previousDraft, 'streamingText') || projection?.finalMessage?.text) {
    draft.streamingText = finalText;
  }

  if (Object.keys(visibleReasoningByEventId).length > 0) {
    draft.streamingReasoningTextByEventId = visibleReasoningByEventId;
  }

  return {
    draft,
    answerState: finalizedAnswerState,
    reasoningStateByEventId: nextReasoningStates,
    pendingAnswerFlush: false,
    pendingReasoningFlushEventIds,
  };
};
