import assert from 'node:assert/strict';
import test from 'node:test';

const loadProtocol = async () =>
  import(`../../packages/runtime-protocol/src/index.ts?test=${Date.now()}`);

const baseEvent = (overrides = {}) => ({
  eventId: 'evt_reasoning_1',
  runId: 'run_1',
  turnId: 'turn_1',
  sessionId: 'session_1',
  messageId: 'msg_1',
  type: 'reasoning.delta',
  ts: Date.now(),
  seq: 1,
  source: { kind: 'model', provider: 'built-in', name: 'assistant' },
  payload: { textChunk: 'checking files' },
  ...overrides,
});

test('canonical protocol exposes reasoning event types', async () => {
  const { CANONICAL_EVENT_TYPES } = await loadProtocol();

  assert.equal(CANONICAL_EVENT_TYPES.includes('reasoning.started'), true);
  assert.equal(CANONICAL_EVENT_TYPES.includes('reasoning.delta'), true);
  assert.equal(CANONICAL_EVENT_TYPES.includes('reasoning.completed'), true);
});

test('canonical validator accepts reasoning stream events', async () => {
  const { assertCanonicalEvent } = await loadProtocol();

  assert.doesNotThrow(() =>
    assertCanonicalEvent(baseEvent({ type: 'reasoning.started', payload: { summary: 'Plan' } })),
  );
  assert.doesNotThrow(() => assertCanonicalEvent(baseEvent()));
  assert.doesNotThrow(() =>
    assertCanonicalEvent(
      baseEvent({
        type: 'reasoning.completed',
        payload: { finalText: 'checked files', summary: 'Done' },
      }),
    ),
  );
});

test('canonical validator rejects malformed reasoning deltas', async () => {
  const { assertCanonicalEvent } = await loadProtocol();

  assert.throws(
    () => assertCanonicalEvent(baseEvent({ payload: { textChunk: '' } })),
    /textChunk/i,
  );
});
