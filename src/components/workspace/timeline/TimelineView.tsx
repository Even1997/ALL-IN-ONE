import React, { useMemo, useState } from 'react';
import type { CanonicalEvent } from '@goodnight/runtime-protocol';
import type { TimelineProjection } from '../../../modules/ai/runtime/composer/timelineComposerTypes.ts';
import { TimelineCard } from './TimelineCard.tsx';
import { TimelineDetailDrawer } from './TimelineDetailDrawer.tsx';
import { buildTimelineDetailItems } from './timelineEventDetails.ts';

export const TimelineView: React.FC<{
  projection: TimelineProjection | null;
}> = ({ projection }) => {
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});

  const eventsById = useMemo(
    () =>
      new Map(
        (projection?.events || []).map((event) => [event.eventId, event] as const),
      ),
    [projection],
  );

  if (!projection || projection.cards.length === 0) {
    return null;
  }

  return (
    <div className="chat-timeline-view">
      {projection.cards.map((card, index) => {
        const open = !!openCards[card.cardId];
        const detailItems = buildTimelineDetailItems(
          card.detailRefs
            .map((detailRef) => eventsById.get(detailRef))
            .filter((event): event is CanonicalEvent => Boolean(event)),
        );

        return (
          <div key={card.cardId}>
            <TimelineCard
              card={card}
              detailsOpen={open}
              onToggleDetails={() =>
                setOpenCards((state) => ({ ...state, [card.cardId]: !state[card.cardId] }))
              }
            />
            {open && detailItems.length > 0 ? <TimelineDetailDrawer items={detailItems} /> : null}
            {index < projection.cards.length - 1 ? <div className="chat-timeline-divider" aria-hidden="true" /> : null}
          </div>
        );
      })}
    </div>
  );
};
