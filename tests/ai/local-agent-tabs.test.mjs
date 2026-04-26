import assert from 'node:assert/strict';
import test from 'node:test';

import { CHAT_AGENTS } from '../../src/modules/ai/chat/chatAgents.ts';

test('chat agent tabs expose Claude, Codex, and built-in AI only', () => {
  assert.deepEqual(
    CHAT_AGENTS.map((agent) => agent.id),
    ['claude', 'codex', 'built-in']
  );

  assert.equal(CHAT_AGENTS[0].label, 'Claude');
  assert.equal(CHAT_AGENTS[1].label, 'Codex');
  assert.equal(CHAT_AGENTS[2].label, 'AI');
  assert.equal(CHAT_AGENTS[0].runtime, 'local');
  assert.equal(CHAT_AGENTS[1].runtime, 'local');
  assert.equal(CHAT_AGENTS[2].runtime, 'built-in');
});
