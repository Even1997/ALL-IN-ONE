export const mapTimelineEventSummary = (event: { kind: string; payload: string }) =>
  `${event.kind}: ${event.payload}`;
