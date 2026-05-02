import assert from 'node:assert/strict';
import test from 'node:test';

const loadRecovery = async () =>
  import(`../../src/modules/ai/runtime/replay/runtimeReplayRecovery.ts?test=${Date.now()}`);

test('buildReplayRecoveryState marks interrupted and failed turns as resume-ready', async () => {
  const { buildReplayRecoveryState, createReplayRecoveryController } = await loadRecovery();

  const interrupted = buildReplayRecoveryState('runtime-thread-1', [
    {
      id: 'replay-1',
      threadId: 'runtime-thread-1',
      eventType: 'turn_started',
      payload: 'Retry this request',
      createdAt: 10,
    },
  ]);
  const failed = buildReplayRecoveryState('runtime-thread-1', [
    {
      id: 'replay-1',
      threadId: 'runtime-thread-1',
      eventType: 'turn_started',
      payload: 'Retry this request',
      createdAt: 10,
    },
    {
      id: 'replay-2',
      threadId: 'runtime-thread-1',
      eventType: 'turn_failed',
      payload: 'network timeout',
      createdAt: 11,
    },
  ]);
  const completed = buildReplayRecoveryState('runtime-thread-1', [
    {
      id: 'replay-1',
      threadId: 'runtime-thread-1',
      eventType: 'turn_started',
      payload: 'Retry this request',
      createdAt: 10,
    },
    {
      id: 'replay-2',
      threadId: 'runtime-thread-1',
      eventType: 'turn_completed',
      payload: 'Done',
      createdAt: 11,
    },
  ]);

  assert.equal(interrupted.resumeState, 'ready');
  assert.equal(interrupted.resumeKind, 'resume-latest-prompt');
  assert.equal(interrupted.resumeActionLabel, '恢复最近一次输入');
  assert.equal(interrupted.resumePrompt, 'Retry this request');
  assert.equal(failed.resumeState, 'ready');
  assert.equal(failed.resumeKind, 'retry-last-failed');
  assert.equal(failed.resumeActionLabel, '重试失败的运行');
  assert.equal(failed.resumePrompt, 'Retry this request');
  assert.equal(completed.resumeState, 'completed');
  assert.equal(completed.resumeKind, 'none');
  assert.equal(completed.resumePrompt, null);

  const storedEvents = [];
  const recoveryUpdates = [];
  const controller = createReplayRecoveryController({
    appendReplayEvent: async ({ threadId, eventType, payload }) => ({
      id: `event-${storedEvents.length + 1}`,
      threadId,
      eventType,
      payload,
      createdAt: storedEvents.length + 1,
    }),
    appendReplayEventToStore: (_threadId, event) => {
      storedEvents.push(event);
    },
    getReplayEvents: () => [...storedEvents],
    setRecoveryState: (threadId, state) => {
      recoveryUpdates.push([threadId, state.resumeKind, state.resumeState]);
    },
  });

  await controller.appendAndSync({
    runtimeStoreThreadId: 'session-1',
    replayThreadId: 'runtime-thread-1',
    eventType: 'turn_started',
    payload: 'Retry this request',
  });
  await controller.appendAndSync({
    runtimeStoreThreadId: 'session-1',
    replayThreadId: 'runtime-thread-1',
    eventType: 'turn_failed',
    payload: 'network timeout',
  });

  assert.deepEqual(recoveryUpdates, [
    ['session-1', 'resume-latest-prompt', 'ready'],
    ['session-1', 'retry-last-failed', 'ready'],
  ]);
});
