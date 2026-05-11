import type { CanonicalEvent } from '@goodnight/runtime-protocol';
import type { TimelineProjection } from '../../../modules/ai/runtime/composer/timelineComposerTypes.ts';
import { buildTimelineDetailItems, type TimelineDetailItem } from './timelineEventDetails.ts';

export type ChatTimelineBubbleCardDescriptor = {
  cardId: string;
  createdAt: number;
  timelineOrder: number;
  card: TimelineProjection['cards'][number];
  detailItems: TimelineDetailItem[];
};

const SUPPRESSED_CHAT_TIMELINE_PHASES = new Set(['approval', 'question', 'response']);

const isReasoningOnlyProgressCard = (
  card: TimelineProjection['cards'][number],
  detailEvents: CanonicalEvent[],
) =>
  card.phase === 'analysis' &&
  detailEvents.length > 0 &&
  detailEvents.every((event) => event.type === 'progress.updated');

export const buildChatTimelineBubbleCards = (
  projection: TimelineProjection | null,
): ChatTimelineBubbleCardDescriptor[] => {
  if (!projection || projection.cards.length === 0) {
    return [];
  }

  const eventsById = new Map(
    (projection.events || []).map((event) => [event.eventId, event] as const),
  );

  return projection.cards
    .flatMap((card, index) => {
      if (SUPPRESSED_CHAT_TIMELINE_PHASES.has(card.phase)) {
        return [];
      }

      const detailEvents = card.detailRefs
        .map((detailRef) => eventsById.get(detailRef))
        .filter((event): event is CanonicalEvent => Boolean(event));

      if (isReasoningOnlyProgressCard(card, detailEvents)) {
        return [];
      }

      return [
        {
          cardId: card.cardId,
          createdAt: card.phase === 'intake' && typeof card.endedAt === 'number'
            ? card.endedAt
            : card.startedAt,
          timelineOrder: card.phase === 'intake' && typeof card.endedAt === 'number'
            ? Number.MAX_SAFE_INTEGER
            : index,
          card,
          detailItems: buildTimelineDetailItems(detailEvents),
        },
      ];
    });
};
