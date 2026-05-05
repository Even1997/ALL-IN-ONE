export const mapTimelineEventSummary = (event: {
  kind: string;
  payload?: string | null;
}) => {
  const payload = `${event.payload || ''}`.trim();
  return payload ? `${event.kind}: ${payload}` : event.kind;
};
