import React, { useState } from 'react';
import { TimelineCard } from './TimelineCard.tsx';
import { TimelineDetailDrawer } from './TimelineDetailDrawer.tsx';
import type { ChatTimelineBubbleCardDescriptor } from './chatTimelineBubbleCardModel.ts';
export { buildChatTimelineBubbleCards } from './chatTimelineBubbleCardModel.ts';

export const ChatTimelineBubbleCard: React.FC<{
  descriptor: ChatTimelineBubbleCardDescriptor;
}> = ({ descriptor }) => {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <>
      <TimelineCard
        card={descriptor.card}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((current) => !current)}
      />
      {detailsOpen && descriptor.detailItems.length > 0 ? (
        <TimelineDetailDrawer items={descriptor.detailItems} />
      ) : null}
    </>
  );
};
