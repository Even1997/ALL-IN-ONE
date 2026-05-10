import assert from 'node:assert/strict';
import test from 'node:test';

const loadProtocol = async () =>
  import(`../../packages/runtime-protocol/src/index.ts?test=${Date.now()}`);

test('canonical event protocol exports stable event types and validator', async () => {
  const {
    CANONICAL_EVENT_TYPES,
    assertCanonicalEvent,
  } = await loadProtocol();

  assert.equal(Array.isArray(CANONICAL_EVENT_TYPES), true);
  assert.equal(CANONICAL_EVENT_TYPES.includes('tool.started'), true);

  assert.doesNotThrow(() =>
    assertCanonicalEvent({
      eventId: 'evt_1',
      runId: 'run_1',
      turnId: 'turn_1',
      sessionId: 'session_1',
      type: 'progress.updated',
      ts: Date.now(),
      seq: 1,
      source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
      payload: { label: '正在检查项目结构' },
    }),
  );
});

test('canonical event validator rejects malformed tool completion payloads', async () => {
  const { assertCanonicalEvent } = await loadProtocol();

  assert.throws(
    () =>
      assertCanonicalEvent({
        eventId: 'evt_2',
        runId: 'run_1',
        turnId: 'turn_1',
        sessionId: 'session_1',
        type: 'tool.completed',
        ts: Date.now(),
        seq: 2,
        source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
        payload: { ok: true },
      }),
    /toolCallId/i,
  );
});
