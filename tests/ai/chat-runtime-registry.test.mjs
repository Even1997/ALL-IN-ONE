import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUILT_IN_CHAT_RUNTIME_PLUGINS,
  getChatAgent,
  getChatAgentIds,
} from '../../src/modules/ai/chat/runtimeRegistry.ts';

test('chat runtime registry exposes built-in Claude, Codex, and built-in plugins', () => {
  assert.deepEqual(getChatAgentIds(), ['claude', 'codex', 'built-in']);
  assert.deepEqual(
    BUILT_IN_CHAT_RUNTIME_PLUGINS.map((plugin) => plugin.id),
    ['claude', 'codex', 'built-in']
  );
});

test('chat runtime registry preserves the current agent labels and runtimes', () => {
  const claude = getChatAgent('claude');
  const codex = getChatAgent('codex');
  const builtIn = getChatAgent('built-in');

  assert.equal(claude?.label, 'Claude');
  assert.equal(claude?.runtime, 'local');
  assert.equal(codex?.label, 'Codex');
  assert.equal(codex?.runtime, 'local');
  assert.equal(builtIn?.label, 'AI');
  assert.equal(builtIn?.runtime, 'built-in');
});
