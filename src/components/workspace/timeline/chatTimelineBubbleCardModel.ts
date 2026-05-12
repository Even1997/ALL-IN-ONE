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

export type ChatTimelineCompletedResponseSummary = {
  cardId: string;
  phase: 'response';
  title: string;
  summary: string;
  status: TimelineProjection['cards'][number]['status'];
  completedAt: number;
  elapsedSeconds?: number;
  detailItems: TimelineDetailItem[];
};

export type ChatTimelineBubbleCardsModel = {
  descriptors: ChatTimelineBubbleCardDescriptor[];
  completedResponseSummary: ChatTimelineCompletedResponseSummary | null;
};

const SUPPRESSED_CHAT_TIMELINE_PHASES = new Set(['intake', 'approval', 'question']);

const REASONING_ONLY_EVENT_TYPES = new Set([
  'progress.updated',
  'reasoning.started',
  'reasoning.delta',
  'reasoning.completed',
]);

const isReasoningOnlyAnalysisCard = (
  card: TimelineProjection['cards'][number],
  detailEvents: CanonicalEvent[],
) =>
  card.phase === 'analysis' &&
  detailEvents.length > 0 &&
  detailEvents.every((event) => REASONING_ONLY_EVENT_TYPES.has(event.type));

const MIN_VALID_EPOCH_SECONDS = 946684800;
const MIN_VALID_EPOCH_MILLISECONDS = MIN_VALID_EPOCH_SECONDS * 1000;

const normalizeTimelineTimestampToMilliseconds = (value: number) => {
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

const deriveElapsedSeconds = (startedAt: number | undefined, completedAt: number) => {
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) {
    return undefined;
  }

  const normalizedStartedAt = normalizeTimelineTimestampToMilliseconds(startedAt);
  const normalizedCompletedAt = normalizeTimelineTimestampToMilliseconds(completedAt);
  if (normalizedStartedAt !== null && normalizedCompletedAt !== null) {
    const deltaSeconds = Math.max(0, (normalizedCompletedAt - normalizedStartedAt) / 1000);
    return deltaSeconds > 0 ? Math.max(1, Math.round(deltaSeconds)) : 0;
  }

  const delta = Math.max(0, completedAt - startedAt);
  return delta > 0 ? Math.max(1, Math.round(delta)) : 0;
};

export const buildChatTimelineBubbleCards = (
  projection: TimelineProjection | null,
): ChatTimelineBubbleCardsModel => {
  if (!projection || projection.cards.length === 0) {
    return {
      descriptors: [],
      completedResponseSummary: null,
    };
  }

  const eventsById = new Map(
    (projection.events || []).map((event) => [event.eventId, event] as const),
  );
  let completedResponseSummary: ChatTimelineCompletedResponseSummary | null = null;

  const descriptors = projection.cards
    .flatMap((card, index) => {
      if (SUPPRESSED_CHAT_TIMELINE_PHASES.has(card.phase)) {
        return [];
      }

      if (card.phase === 'response' && card.status !== 'completed') {
        return [];
      }

      const detailEvents = card.detailRefs
        .map((detailRef) => eventsById.get(detailRef))
        .filter((event): event is CanonicalEvent => Boolean(event));

      if (isReasoningOnlyAnalysisCard(card, detailEvents)) {
        return [];
      }

      if (card.phase === 'response') {
        const completedAt = projection.finalMessage?.completedAt ?? card.endedAt ?? card.startedAt;
        completedResponseSummary = {
          cardId: card.cardId,
          phase: 'response',
          title: card.title,
          summary: projection.finalMessage?.text || card.summary,
          status: card.status,
          completedAt,
          elapsedSeconds: deriveElapsedSeconds(card.startedAt, completedAt),
          detailItems: buildTimelineDetailItems(detailEvents),
        };
        return [];
      }

      return [
        {
          cardId: card.cardId,
          createdAt: card.startedAt,
          timelineOrder: index,
          card,
          detailItems: buildTimelineDetailItems(detailEvents),
        },
      ];
    });

  return {
    descriptors,
    completedResponseSummary,
  };
};
