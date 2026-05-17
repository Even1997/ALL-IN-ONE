import assert from 'node:assert/strict';
import test from 'node:test';

const loadDeltaModule = async () =>
  import(`../../src/modules/runtime-sidecar/runtimeSidecarMessageDelta.ts?test=${Date.now()}`);

test('runtime sidecar snapshot deltas append only the new suffix after prior canonical text', async () => {
  const { resolveRuntimeSidecarSnapshotMessageDelta } = await loadDeltaModule();

  const canonicalEvents = [
    {
      type: 'message.delta',
      messageId: 'assistant_1',
      runId: 'assistant_1',
      ts: 1,
      seq: 1,
      payload: {
        textChunk: 'ok',
        phase: 'final_answer',
      },
    },
  ];

  assert.equal(
    resolveRuntimeSidecarSnapshotMessageDelta(
      canonicalEvents,
      'assistant_1',
      'ok, let me inspect the project directory.',
    ),
    ', let me inspect the project directory.',
  );
});

test('runtime sidecar snapshot deltas skip rewritten snapshots instead of duplicating visible output', async () => {
  const { resolveRuntimeSidecarSnapshotMessageDelta } = await loadDeltaModule();

  const canonicalEvents = [
    {
      type: 'message.delta',
      messageId: 'assistant_1',
      runId: 'assistant_1',
      ts: 1,
      seq: 1,
      payload: {
        textChunk: 'old process text',
        phase: 'final_answer',
      },
    },
  ];

  assert.equal(
    resolveRuntimeSidecarSnapshotMessageDelta(
      canonicalEvents,
      'assistant_1',
      'new process text',
    ),
    '',
  );
});

test('runtime sidecar reasoning snapshot deltas append only the new suffix after prior canonical reasoning text', async () => {
  const { resolveRuntimeSidecarSnapshotReasoningDelta } = await loadDeltaModule();

  const canonicalEvents = [
    {
      type: 'reasoning.delta',
      messageId: 'assistant_1',
      runId: 'assistant_1',
      ts: 1,
      seq: 1,
      payload: {
        textChunk: '好的，让我先看看这个项目的结构。',
      },
    },
  ];

  assert.equal(
    resolveRuntimeSidecarSnapshotReasoningDelta(
      canonicalEvents,
      'assistant_1',
      '好的，让我先看看这个项目的结构。然后我会顺着运行链路继续排查。',
    ),
    '然后我会顺着运行链路继续排查。',
  );
});

test('runtime sidecar reasoning snapshot deltas skip rewritten reasoning snapshots instead of duplicating visible output', async () => {
  const { resolveRuntimeSidecarSnapshotReasoningDelta } = await loadDeltaModule();

  const canonicalEvents = [
    {
      type: 'reasoning.delta',
      messageId: 'assistant_1',
      runId: 'assistant_1',
      ts: 1,
      seq: 1,
      payload: {
        textChunk: 'old reasoning text',
      },
    },
  ];

  assert.equal(
    resolveRuntimeSidecarSnapshotReasoningDelta(
      canonicalEvents,
      'assistant_1',
      'new reasoning text',
    ),
    '',
  );
});
