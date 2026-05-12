import type { CanonicalEvent } from '@goodnight/runtime-protocol';

const belongsToMessage = (event: CanonicalEvent, messageId: string) =>
  event.messageId === messageId || event.runId === messageId;

const sortCanonicalEvents = (events: CanonicalEvent[]) =>
  [...events].sort((left, right) => {
    if (left.ts !== right.ts) {
      return left.ts - right.ts;
    }

    return left.seq - right.seq;
  });

export const resolveRuntimeSidecarProjectedMessageText = (
  canonicalEvents: CanonicalEvent[] = [],
  messageId: string,
) => {
  let projectedText = '';

  for (const event of sortCanonicalEvents(canonicalEvents)) {
    if (!belongsToMessage(event, messageId)) {
      continue;
    }

    if (event.type === 'message.delta') {
      if (event.payload.phase === 'commentary') {
        continue;
      }

      projectedText += event.payload.textChunk;
      continue;
    }

    if (event.type === 'message.completed') {
      if (event.payload.phase === 'commentary') {
        continue;
      }

      projectedText = event.payload.finalText;
    }
  }

  return projectedText;
};

export const resolveRuntimeSidecarSnapshotMessageDelta = (
  canonicalEvents: CanonicalEvent[] = [],
  messageId: string,
  snapshotText: string,
) => {
  if (!snapshotText) {
    return '';
  }

  const projectedText = resolveRuntimeSidecarProjectedMessageText(canonicalEvents, messageId);
  if (!projectedText) {
    return snapshotText;
  }

  if (snapshotText === projectedText) {
    return '';
  }

  return snapshotText.startsWith(projectedText) ? snapshotText.slice(projectedText.length) : '';
};
