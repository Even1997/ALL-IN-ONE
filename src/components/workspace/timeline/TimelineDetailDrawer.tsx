import React from 'react';
import type { TimelineDetailItem } from './timelineEventDetails.ts';

export const TimelineDetailDrawer: React.FC<{
  items: TimelineDetailItem[];
}> = ({ items }) => (
  <div className="chat-timeline-detail-drawer">
    {items.map((item) => (
      <div key={item.key} className={`chat-timeline-detail-line ${item.tone || 'default'}`}>
        <div className="chat-timeline-detail-copy">
          <strong>{item.label}</strong>
          {item.value
            ? item.mono
              ? <pre>{item.value}</pre>
              : <span>{item.value}</span>
            : null}
        </div>
      </div>
    ))}
  </div>
);
