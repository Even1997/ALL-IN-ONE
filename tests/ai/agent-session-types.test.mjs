import assert from 'node:assert/strict';
import test from 'node:test';

const loadTypes = async () =>
  import(`../../src/modules/ai/runtime/session/agentSessionTypes.ts?test=${Date.now()}`);
const loadSelectors = async () =>
  import(`../../src/modules/ai/runtime/session/agentSessionSelectors.ts?test=${Date.now()}`);

test('agent session types expose the codex-like turn session shape', async () => {
  const module = await loadTypes();

  assert.equal(typeof module.createEmptyAgentTurnSession, 'function');

  const session = module.createEmptyAgentTurnSession({
    id: 'turn-1',
    threadId: 'thread-1',
    providerId: 'codex',
    userPrompt: 'fix the bug',
  });

  assert.equal(session.status, 'idle');
  assert.equal(session.mode, 'direct');
  assert.deepEqual(session.executionSteps, []);
  assert.equal(session.resumeSnapshot, null);
});

test('getLatestTurnSession returns the last session and null for empty input', async () => {
  const { getLatestTurnSession } = await loadSelectors();

  assert.equal(getLatestTurnSession(null), null);
  assert.deepEqual(
    getLatestTurnSession([
      { id: 'turn-1', createdAt: 1 },
      { id: 'turn-2', createdAt: 2 },
    ]),
    { id: 'turn-2', createdAt: 2 },
  );
});
