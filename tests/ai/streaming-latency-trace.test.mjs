import assert from 'node:assert/strict';
import test from 'node:test';

test('streaming latency trace tracks provider, frontend flush, and visible milestones', async () => {
  const {
    createStreamingLatencyTrace,
    recordProviderChunk,
    recordFrontendFlush,
    recordFirstVisibleChar,
    recordFinalVisibleDone,
  } = await import(`../../src/modules/ai/runtime/streamingLatencyTrace.ts?test=${Date.now()}`);

  const started = createStreamingLatencyTrace(1000);
  const firstChunk = recordProviderChunk(started, {
    providerChunkAt: 1200,
    runtimeBroadcastAt: 1210,
    sidecarReceivedAt: 1215,
  });
  const secondChunk = recordProviderChunk(firstChunk, {
    providerChunkAt: 1360,
    runtimeBroadcastAt: 1370,
    sidecarReceivedAt: 1374,
  });
  const flushed = recordFrontendFlush(secondChunk, 1390);
  const firstVisible = recordFirstVisibleChar(flushed, 1410);
  const completed = recordFinalVisibleDone(firstVisible, 1800);

  assert.equal(firstChunk.requestStartedAt, 1000);
  assert.equal(firstChunk.providerFirstChunkAt, 1200);
  assert.equal(secondChunk.providerChunkIntervalMs, 160);
  assert.equal(flushed.frontendStateFlushAt, 1390);
  assert.equal(firstVisible.firstVisibleCharAt, 1410);
  assert.equal(firstVisible.endToEndFirstVisibleMs, 410);
  assert.equal(completed.finalVisibleDoneAt, 1800);
  assert.equal(completed.endToEndCompletedMs, 800);
});
