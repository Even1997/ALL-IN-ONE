export const mapTimelineEventSummary = (event: {
  kind: string;
  payload?: string | null;
}) => {
  const payload = `${event.payload || ''}`.trim();
  return payload ? `${event.kind}: ${payload}` : event.kind;
};

export const mapTimelineCardSummary = (card: {
  summary: string;
  title: string;
  phase: string;
}) => card.summary.trim() || card.title.trim() || card.phase;
