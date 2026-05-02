import assert from 'node:assert/strict';
import test from 'node:test';

const loadTimeline = async () =>
  import(`../../src/modules/ai/runtime/timeline/timelineMappers.ts?test=${Date.now()}`);

const loadTurnRunner = async () =>
  import(`../../src/modules/ai/runtime/orchestration/agentTurnRunner.ts?test=${Date.now()}`);

test('timeline mappers normalize thinking, tool, message, and approval events', async () => {
  const { mapTimelineEventSummary } = await loadTimeline();

  assert.equal(mapTimelineEventSummary({ kind: 'thinking', payload: 'Plan' }), 'thinking: Plan');
  assert.equal(mapTimelineEventSummary({ kind: 'approval', payload: 'Need approval' }), 'approval: Need approval');
  assert.equal(mapTimelineEventSummary({ kind: 'tool', payload: 'list-skills' }), 'tool: list-skills');
});

test('agent turn runner builds a queued runtime turn shell', async () => {
  const {
    createQueuedRuntimeTurn,
    createRunningRuntimeTurn,
    completeRuntimeTurn,
    failRuntimeTurn,
    startRuntimeTurnLifecycle,
    completeRuntimeTurnLifecycle,
    failRuntimeTurnLifecycle,
    createRuntimeTurnController,
    createRuntimeExecutionController,
    createRuntimeReplayExecutionController,
    createRuntimeStreamingMessageAssembler,
  } =
    await loadTurnRunner();
  const turn = createQueuedRuntimeTurn({
    threadId: 'thread-1',
    providerId: 'codex',
    prompt: 'Summarize the project state',
    createdAt: 20,
  });

  assert.equal(turn.threadId, 'thread-1');
  assert.equal(turn.providerId, 'codex');
  assert.equal(turn.status, 'queued');
  assert.equal(turn.completedAt, null);

  const runningTurn = createRunningRuntimeTurn({
    id: 'turn-running',
    threadId: 'thread-1',
    providerId: 'codex',
    prompt: 'Summarize the project state',
    createdAt: 21,
  });
  const completedTurn = completeRuntimeTurn(runningTurn, 22);
  const failedTurn = failRuntimeTurn(runningTurn, 23);

  assert.equal(runningTurn.status, 'running');
  assert.equal(completedTurn.status, 'completed');
  assert.equal(completedTurn.completedAt, 22);
  assert.equal(failedTurn.status, 'failed');
  assert.equal(failedTurn.completedAt, 23);

  const submittedTurns = [];
  const runTransitions = [];
  const lifecycleTurn = startRuntimeTurnLifecycle({
    turnId: 'turn-lifecycle',
    threadId: 'thread-2',
    providerId: 'claude',
    prompt: 'Recover the latest turn',
    createdAt: 30,
    submitTurn: (threadId, nextTurn) => submittedTurns.push([threadId, nextTurn.status]),
    startRun: (threadId) => runTransitions.push(`start:${threadId}`),
  });
  const completedLifecycleTurn = completeRuntimeTurnLifecycle({
    turn: lifecycleTurn,
    completedAt: 31,
    submitTurn: (threadId, nextTurn) => submittedTurns.push([threadId, nextTurn.status]),
    finishRun: (threadId) => runTransitions.push(`finish:${threadId}`),
  });
  const failedLifecycleTurn = failRuntimeTurnLifecycle({
    turn: lifecycleTurn,
    error: 'timeout',
    completedAt: 32,
    submitTurn: (threadId, nextTurn) => submittedTurns.push([threadId, nextTurn.status]),
    failRun: (threadId, error) => runTransitions.push(`fail:${threadId}:${error}`),
  });

  assert.equal(completedLifecycleTurn.status, 'completed');
  assert.equal(failedLifecycleTurn.status, 'failed');
  assert.deepEqual(submittedTurns, [
    ['thread-2', 'running'],
    ['thread-2', 'completed'],
    ['thread-2', 'failed'],
  ]);
  assert.deepEqual(runTransitions, ['start:thread-2', 'finish:thread-2', 'fail:thread-2:timeout']);

  const controllerTransitions = [];
  const controller = createRuntimeTurnController({
    turnId: 'turn-controller',
    threadId: 'thread-3',
    providerId: 'codex',
    prompt: 'Controller prompt',
    createdAt: 40,
    submitTurn: (threadId, nextTurn) => controllerTransitions.push(`submit:${threadId}:${nextTurn.status}`),
    startRun: (threadId) => controllerTransitions.push(`start:${threadId}`),
    finishRun: (threadId) => controllerTransitions.push(`finish:${threadId}`),
    failRun: (threadId, error) => controllerTransitions.push(`fail:${threadId}:${error}`),
  });

  assert.equal(controller.getTurn().status, 'running');
  controller.complete(41);
  assert.equal(controller.getTurn().status, 'completed');

  const failedController = createRuntimeTurnController({
    turnId: 'turn-controller-fail',
    threadId: 'thread-4',
    providerId: 'claude',
    prompt: 'Controller fail prompt',
    createdAt: 50,
    submitTurn: (threadId, nextTurn) => controllerTransitions.push(`submit:${threadId}:${nextTurn.status}`),
    startRun: (threadId) => controllerTransitions.push(`start:${threadId}`),
    finishRun: (threadId) => controllerTransitions.push(`finish:${threadId}`),
    failRun: (threadId, error) => controllerTransitions.push(`fail:${threadId}:${error}`),
  });
  failedController.fail('bad gateway', 51);
  assert.equal(failedController.getTurn().status, 'failed');
  assert.deepEqual(controllerTransitions, [
    'submit:thread-3:running',
    'start:thread-3',
    'submit:thread-3:completed',
    'finish:thread-3',
    'submit:thread-4:running',
    'start:thread-4',
    'submit:thread-4:failed',
    'fail:thread-4:bad gateway',
  ]);

  const replayTransitions = [];
  const executionController = createRuntimeExecutionController({
    turnId: 'turn-execution',
    threadId: 'thread-5',
    providerId: 'codex',
    prompt: 'Execution prompt',
    createdAt: 60,
    submitTurn: (threadId, nextTurn) => replayTransitions.push(`submit:${threadId}:${nextTurn.status}`),
    startRun: (threadId) => replayTransitions.push(`start:${threadId}`),
    finishRun: (threadId) => replayTransitions.push(`finish:${threadId}`),
    failRun: (threadId, error) => replayTransitions.push(`fail:${threadId}:${error}`),
    appendReplayStart: async (prompt) => {
      replayTransitions.push(`replay-start:${prompt}`);
    },
    appendReplayOutcome: async (eventType, payload) => {
      replayTransitions.push(`replay-outcome:${eventType}:${payload}`);
    },
  });

  await executionController.start();
  await executionController.completeWithReplay('Execution done', 61);
  const failedExecutionController = createRuntimeExecutionController({
    turnId: 'turn-execution-fail',
    threadId: 'thread-6',
    providerId: 'claude',
    prompt: 'Execution fail prompt',
    createdAt: 70,
    submitTurn: (threadId, nextTurn) => replayTransitions.push(`submit:${threadId}:${nextTurn.status}`),
    startRun: (threadId) => replayTransitions.push(`start:${threadId}`),
    finishRun: (threadId) => replayTransitions.push(`finish:${threadId}`),
    failRun: (threadId, error) => replayTransitions.push(`fail:${threadId}:${error}`),
    appendReplayStart: async (prompt) => {
      replayTransitions.push(`replay-start:${prompt}`);
    },
    appendReplayOutcome: async (eventType, payload) => {
      replayTransitions.push(`replay-outcome:${eventType}:${payload}`);
    },
  });
  await failedExecutionController.start();
  await failedExecutionController.failWithReplay('Execution failed', 71);

  assert.deepEqual(replayTransitions, [
    'submit:thread-5:running',
    'start:thread-5',
    'replay-start:Execution prompt',
    'replay-outcome:turn_completed:Execution done',
    'submit:thread-5:completed',
    'finish:thread-5',
    'submit:thread-6:running',
    'start:thread-6',
    'replay-start:Execution fail prompt',
    'replay-outcome:turn_failed:Execution failed',
    'submit:thread-6:failed',
    'fail:thread-6:Execution failed',
  ]);

  const replayWrapperTransitions = [];
  const replayExecutionController = createRuntimeReplayExecutionController({
    turnId: 'turn-execution-wrapper',
    threadId: 'thread-7',
    providerId: 'codex',
    prompt: 'Wrapped execution prompt',
    createdAt: 80,
    runtimeStoreThreadId: 'session-7',
    replayThreadId: 'runtime-thread-7',
    submitTurn: (threadId, nextTurn) => replayWrapperTransitions.push(`submit:${threadId}:${nextTurn.status}`),
    startRun: (threadId) => replayWrapperTransitions.push(`start:${threadId}`),
    finishRun: (threadId) => replayWrapperTransitions.push(`finish:${threadId}`),
    failRun: (threadId, error) => replayWrapperTransitions.push(`fail:${threadId}:${error}`),
    appendAndSyncReplayEvent: async ({ runtimeStoreThreadId, replayThreadId, eventType, payload }) => {
      replayWrapperTransitions.push(
        `replay:${runtimeStoreThreadId}:${replayThreadId}:${eventType}:${payload}`,
      );
    },
  });

  await replayExecutionController.start();
  await replayExecutionController.completeWithReplay('Wrapped execution done', 81);

  assert.deepEqual(replayWrapperTransitions, [
    'submit:thread-7:running',
    'start:thread-7',
    'replay:session-7:runtime-thread-7:turn_started:Wrapped execution prompt',
    'replay:session-7:runtime-thread-7:turn_completed:Wrapped execution done',
    'submit:thread-7:completed',
    'finish:thread-7',
  ]);

  const streamAssembler = createRuntimeStreamingMessageAssembler();
  assert.equal(streamAssembler.append({ kind: 'thinking', delta: 'Plan first' }), '<think>Plan first');
  assert.equal(
    streamAssembler.append({ kind: 'output', delta: 'Then answer' }),
    '<think>Plan first\n\nThen answer',
  );
  assert.equal(streamAssembler.buildFinal(''), '<think>Plan first</think>\n\nThen answer');

  const responseOnlyAssembler = createRuntimeStreamingMessageAssembler();
  assert.equal(responseOnlyAssembler.buildFinal('Fallback response'), 'Fallback response');

  const emptyAssembler = createRuntimeStreamingMessageAssembler();
  assert.equal(emptyAssembler.buildFinal(''), '已收到请求，但这次没有返回内容。');
});
