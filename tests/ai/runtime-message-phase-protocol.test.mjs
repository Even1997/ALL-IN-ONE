import assert from 'node:assert/strict';
import test from 'node:test';

const loadProtocol = async () =>
  import(`../../packages/runtime-protocol/src/index.ts?test=${Date.now()}`);

const baseEvent = (overrides = {}) => ({
  eventId: 'evt_phase_1',
  runId: 'run_1',
  turnId: 'turn_1',
  sessionId: 'session_1',
  messageId: 'msg_1',
  type: 'message.delta',
  ts: Date.now(),
  seq: 1,
  source: { kind: 'model', provider: 'built-in', name: 'assistant' },
  payload: { textChunk: 'hello', phase: 'final_answer' },
  ...overrides,
});

test('message canonical events accept explicit phases', async () => {
  const { assertCanonicalEvent } = await loadProtocol();

  for (const phase of ['commentary', 'final_answer', 'unknown']) {
    assert.doesNotThrow(() =>
      assertCanonicalEvent(baseEvent({ payload: { textChunk: 'hello', phase } })),
    );
  }
});

test('message canonical events allow omitted phase as unknown-compatible input', async () => {
  const { assertCanonicalEvent } = await loadProtocol();

  assert.doesNotThrow(() =>
    assertCanonicalEvent(baseEvent({ payload: { textChunk: 'legacy delta' } })),
  );
});

test('message canonical events reject invalid phase values', async () => {
  const { assertCanonicalEvent } = await loadProtocol();

  assert.throws(
    () => assertCanonicalEvent(baseEvent({ payload: { textChunk: 'bad', phase: 'final' } })),
    /phase/i,
  );
});
