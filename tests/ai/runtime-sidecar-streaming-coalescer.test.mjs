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

test('runtime sidecar message coalescer keeps only the latest same-frame draft message', async () => {
  const { createRuntimeSidecarMessageCoalescer } = await import(
    `../../src/modules/runtime-sidecar/runtimeSidecarStreamingCoalescer.ts?test=${Date.now()}`
  );

  const applied = [];
  const scheduled = [];
  const coalescer = createRuntimeSidecarMessageCoalescer({
    scheduleFlush: (flush) => {
      scheduled.push(flush);
      return () => {};
    },
    applyMessage: (sessionId, message, emittedAt) => {
      applied.push({ sessionId, content: message.content, emittedAt });
    },
  });

  coalescer.push('session-1', { id: 'message-1', role: 'assistant', content: 'Hel', createdAt: 1 }, 10);
  coalescer.push('session-1', { id: 'message-1', role: 'assistant', content: 'Hello', createdAt: 1 }, 12);

  assert.deepEqual(applied, [
    { sessionId: 'session-1', content: 'Hel', emittedAt: 10 },
  ]);
  assert.equal(scheduled.length, 1);

  scheduled[0]();

  assert.deepEqual(applied, [
    { sessionId: 'session-1', content: 'Hel', emittedAt: 10 },
    { sessionId: 'session-1', content: 'Hello', emittedAt: 12 },
  ]);
});

test('runtime sidecar message coalescer applies the first draft immediately', async () => {
  const { createRuntimeSidecarMessageCoalescer } = await import(
    `../../src/modules/runtime-sidecar/runtimeSidecarStreamingCoalescer.ts?test=${Date.now()}`
  );

  const applied = [];
  const scheduled = [];
  const coalescer = createRuntimeSidecarMessageCoalescer({
    scheduleFlush: (flush) => {
      scheduled.push(flush);
      return () => {};
    },
    applyMessage: (sessionId, message, emittedAt) => {
      applied.push({ sessionId, content: message.content, emittedAt });
    },
  });

  coalescer.push('session-1', { id: 'message-1', role: 'assistant', content: 'Hel', createdAt: 1 }, 10);

  assert.deepEqual(applied, [
    { sessionId: 'session-1', content: 'Hel', emittedAt: 10 },
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
