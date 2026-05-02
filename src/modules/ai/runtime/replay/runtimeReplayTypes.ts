export type RuntimeReplayEvent = {
  id: string;
  threadId: string;
  eventType: string;
  payload: string;
  createdAt: number;
};
