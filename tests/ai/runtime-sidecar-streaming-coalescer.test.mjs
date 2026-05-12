import assert from 'node:assert/strict';
import test from 'node:test';

test('runtime sidecar delta coalescer batches same-frame stream deltas', async () => {
  const { createRuntimeSidecarDeltaCoalescer } = await import(
    `../../src/modules/runtime-sidecar/runtimeSidecarStreamingCoalescer.ts?test=${Date.now()}`
  );

  const applied = [];
  const scheduled = [];
  const coalescer = createRuntimeSidecarDeltaCoalescer({
    scheduleFlush: (flush) => {
      scheduled.push(flush);
      return () => {};
    },
    applyDelta: (sessionId, messageId, delta, emittedAt) => {
      applied.push({ sessionId, messageId, delta, emittedAt });
    },
  });

  coalescer.push('session-1', 'message-1', 'Hel', 10);
  coalescer.push('session-1', 'message-1', 'lo', 12);
  coalescer.push('session-1', 'message-2', 'Other', 14);

  assert.deepEqual(applied, [
    { sessionId: 'session-1', messageId: 'message-1', delta: 'Hel', emittedAt: 10 },
    { sessionId: 'session-1', messageId: 'message-2', delta: 'Other', emittedAt: 14 },
  ]);
  assert.equal(scheduled.length, 1);

  scheduled[0]();

  assert.deepEqual(applied, [
    { sessionId: 'session-1', messageId: 'message-1', delta: 'Hel', emittedAt: 10 },
    { sessionId: 'session-1', messageId: 'message-2', delta: 'Other', emittedAt: 14 },
    { sessionId: 'session-1', messageId: 'message-1', delta: 'lo', emittedAt: 12 },
  ]);
});

test('runtime sidecar delta coalescer applies the first chunk immediately', async () => {
  const { createRuntimeSidecarDeltaCoalescer } = await import(
    `../../src/modules/runtime-sidecar/runtimeSidecarStreamingCoalescer.ts?test=${Date.now()}`
  );

  const applied = [];
  const scheduled = [];
  const coalescer = createRuntimeSidecarDeltaCoalescer({
    scheduleFlush: (flush) => {
      scheduled.push(flush);
      return () => {};
    },
    applyDelta: (sessionId, messageId, delta, emittedAt) => {
      applied.push({ sessionId, messageId, delta, emittedAt });
    },
  });

  coalescer.push('session-1', 'message-1', 'Hel', 10);

  assert.deepEqual(applied, [
    { sessionId: 'session-1', messageId: 'message-1', delta: 'Hel', emittedAt: 10 },
  ]);
  assert.equal(scheduled.length, 1);
});

test('runtime sidecar default scheduler flushes pending deltas in the same task turn', async () => {
  const { createRuntimeSidecarDeltaCoalescer } = await import(
    `../../src/modules/runtime-sidecar/runtimeSidecarStreamingCoalescer.ts?test=${Date.now()}`
  );

  const applied = [];
  const coalescer = createRuntimeSidecarDeltaCoalescer({
    applyDelta: (sessionId, messageId, delta, emittedAt) => {
      applied.push({ sessionId, messageId, delta, emittedAt });
    },
  });

  coalescer.push('session-1', 'message-1', 'Hel', 10);
  coalescer.push('session-1', 'message-1', 'lo', 12);

  assert.deepEqual(applied, [
    { sessionId: 'session-1', messageId: 'message-1', delta: 'Hel', emittedAt: 10 },
  ]);

  await Promise.resolve();

  assert.deepEqual(applied, [
    { sessionId: 'session-1', messageId: 'message-1', delta: 'Hel', emittedAt: 10 },
    { sessionId: 'session-1', messageId: 'message-1', delta: 'lo', emittedAt: 12 },
  ]);
});
