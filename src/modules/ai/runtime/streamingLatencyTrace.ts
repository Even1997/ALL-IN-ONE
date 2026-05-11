export type StreamingLatencyTrace = {
  requestStartedAt: number | null;
  providerFirstChunkAt: number | null;
  providerChunkAt: number | null;
  providerChunkIntervalMs: number | null;
  runtimeBroadcastAt: number | null;
  sidecarReceivedAt: number | null;
  frontendStateFlushAt: number | null;
  firstVisibleCharAt: number | null;
  finalVisibleDoneAt: number | null;
  chunkIndex: number;
  endToEndFirstVisibleMs: number | null;
  endToEndCompletedMs: number | null;
};

type ProviderChunkInput = {
  requestStartedAt?: number | null;
  providerFirstChunkAt?: number | null;
  providerChunkAt: number;
  runtimeBroadcastAt: number;
  sidecarReceivedAt: number;
  chunkIndex?: number;
};

const toDuration = (startedAt: number | null, endedAt: number | null) =>
  typeof startedAt === 'number' && typeof endedAt === 'number' ? Math.max(0, endedAt - startedAt) : null;

const finalizeTrace = (trace: StreamingLatencyTrace): StreamingLatencyTrace => ({
  ...trace,
  endToEndFirstVisibleMs: toDuration(trace.requestStartedAt, trace.firstVisibleCharAt),
  endToEndCompletedMs: toDuration(trace.requestStartedAt, trace.finalVisibleDoneAt),
});

export const createStreamingLatencyTrace = (requestStartedAt?: number | null): StreamingLatencyTrace =>
  finalizeTrace({
    requestStartedAt: typeof requestStartedAt === 'number' ? requestStartedAt : null,
    providerFirstChunkAt: null,
    providerChunkAt: null,
    providerChunkIntervalMs: null,
    runtimeBroadcastAt: null,
    sidecarReceivedAt: null,
    frontendStateFlushAt: null,
    firstVisibleCharAt: null,
    finalVisibleDoneAt: null,
    chunkIndex: 0,
    endToEndFirstVisibleMs: null,
    endToEndCompletedMs: null,
  });

export const recordProviderChunk = (
  trace: StreamingLatencyTrace | null | undefined,
  input: ProviderChunkInput,
): StreamingLatencyTrace => {
  const current = trace ?? createStreamingLatencyTrace(input.requestStartedAt);
  const previousProviderChunkAt = current.providerChunkAt;

  return finalizeTrace({
    ...current,
    requestStartedAt:
      typeof input.requestStartedAt === 'number' ? input.requestStartedAt : current.requestStartedAt,
    providerFirstChunkAt:
      current.providerFirstChunkAt
      ?? (typeof input.providerFirstChunkAt === 'number' ? input.providerFirstChunkAt : input.providerChunkAt),
    providerChunkAt: input.providerChunkAt,
    providerChunkIntervalMs:
      typeof previousProviderChunkAt === 'number'
        ? Math.max(0, input.providerChunkAt - previousProviderChunkAt)
        : current.providerChunkIntervalMs,
    runtimeBroadcastAt: input.runtimeBroadcastAt,
    sidecarReceivedAt: input.sidecarReceivedAt,
    chunkIndex:
      typeof input.chunkIndex === 'number'
        ? Math.max(current.chunkIndex, input.chunkIndex)
        : current.chunkIndex + 1,
  });
};

export const recordFrontendFlush = (
  trace: StreamingLatencyTrace | null | undefined,
  frontendStateFlushAt: number,
): StreamingLatencyTrace =>
  finalizeTrace({
    ...(trace ?? createStreamingLatencyTrace()),
    frontendStateFlushAt,
  });

export const recordFirstVisibleChar = (
  trace: StreamingLatencyTrace | null | undefined,
  firstVisibleCharAt: number,
): StreamingLatencyTrace =>
  finalizeTrace({
    ...(trace ?? createStreamingLatencyTrace()),
    firstVisibleCharAt,
  });

export const recordFinalVisibleDone = (
  trace: StreamingLatencyTrace | null | undefined,
  finalVisibleDoneAt: number,
): StreamingLatencyTrace =>
  finalizeTrace({
    ...(trace ?? createStreamingLatencyTrace()),
    finalVisibleDoneAt,
  });

export const areStreamingLatencyTracesEqual = (
  left: StreamingLatencyTrace | null | undefined,
  right: StreamingLatencyTrace | null | undefined,
) => {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.requestStartedAt === right.requestStartedAt
    && left.providerFirstChunkAt === right.providerFirstChunkAt
    && left.providerChunkAt === right.providerChunkAt
    && left.providerChunkIntervalMs === right.providerChunkIntervalMs
    && left.runtimeBroadcastAt === right.runtimeBroadcastAt
    && left.sidecarReceivedAt === right.sidecarReceivedAt
    && left.frontendStateFlushAt === right.frontendStateFlushAt
    && left.firstVisibleCharAt === right.firstVisibleCharAt
    && left.finalVisibleDoneAt === right.finalVisibleDoneAt
    && left.chunkIndex === right.chunkIndex
    && left.endToEndFirstVisibleMs === right.endToEndFirstVisibleMs
    && left.endToEndCompletedMs === right.endToEndCompletedMs;
};
