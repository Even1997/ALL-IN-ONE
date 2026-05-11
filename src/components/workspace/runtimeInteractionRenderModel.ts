import type {
  StoredChatMessage,
  StoredChatRuntimeEvent,
} from '../../modules/ai/store/aiChatStore.ts';

export type RuntimeInteractionTimelineEvent = Extract<
  StoredChatRuntimeEvent,
  { kind: 'approval' | 'question' }
>;

export type RuntimeInteractionRenderEntry = {
  event: RuntimeInteractionTimelineEvent;
  createdAt: number;
  timelineOrder: number;
};

export type RuntimeApprovalRenderEntry = RuntimeInteractionRenderEntry & {
  event: Extract<RuntimeInteractionTimelineEvent, { kind: 'approval' }>;
};

export type RuntimeQuestionRenderEntry = RuntimeInteractionRenderEntry & {
  event: Extract<RuntimeInteractionTimelineEvent, { kind: 'question' }>;
};

export const getRuntimeInteractionRenderEntries = (
  message: StoredChatMessage,
): RuntimeInteractionRenderEntry[] => {
  if (message.role !== 'assistant' || !Array.isArray(message.timeline)) {
    return [];
  }

  return message.timeline.flatMap((event, timelineOrder) => {
    if (event.kind !== 'approval' && event.kind !== 'question') {
      return [];
    }

    return [
      {
        event,
        createdAt: event.createdAt,
        timelineOrder,
      },
    ];
  });
};

export const getRuntimeApprovalRenderEntries = (
  message: StoredChatMessage,
): RuntimeApprovalRenderEntry[] =>
  getRuntimeInteractionRenderEntries(message).filter(
    (entry): entry is RuntimeApprovalRenderEntry => entry.event.kind === 'approval',
  );

export const getRuntimeQuestionRenderEntries = (
  message: StoredChatMessage,
): RuntimeQuestionRenderEntry[] =>
  getRuntimeInteractionRenderEntries(message).filter(
    (entry): entry is RuntimeQuestionRenderEntry => entry.event.kind === 'question',
  );
