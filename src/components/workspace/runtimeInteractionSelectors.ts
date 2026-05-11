import { getAssistantRuntimeTimelineEvents } from '../../modules/ai/store/assistantTimeline.ts';
import type {
  StoredChatAssistantMessage,
  StoredChatMessage,
  StoredChatRuntimeEvent,
} from '../../modules/ai/store/aiChatStore.ts';

type ApprovalTimelineEvent = Extract<StoredChatRuntimeEvent, { kind: 'approval' }>;
type QuestionTimelineEvent = Extract<StoredChatRuntimeEvent, { kind: 'question' }>;

const getAssistantRuntimeEventsReverse = (message: StoredChatAssistantMessage) =>
  [...getAssistantRuntimeTimelineEvents(message.timeline)].reverse();

export const getLatestPendingRuntimeApprovalEvent = (
  message: StoredChatMessage,
): ApprovalTimelineEvent | null => {
  if (message.role !== 'assistant') {
    return null;
  }

  return (
    getAssistantRuntimeEventsReverse(message).find(
      (event): event is ApprovalTimelineEvent =>
        event.kind === 'approval' && event.status === 'pending',
    ) || null
  );
};

export const getLatestRuntimeQuestionEvent = (
  message: StoredChatMessage,
): QuestionTimelineEvent | null => {
  if (message.role !== 'assistant') {
    return null;
  }

  return (
    getAssistantRuntimeEventsReverse(message).find(
      (event): event is QuestionTimelineEvent => event.kind === 'question',
    ) || null
  );
};
