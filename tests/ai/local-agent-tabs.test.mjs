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

test('chat agent tabs stay backed by the runtime registry source', async () => {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = await readFile(path.resolve(__dirname, '../../src/modules/ai/chat/chatAgents.ts'), 'utf8');

  assert.match(source, /from '\.\/runtimeRegistry\.ts'/);
  assert.match(source, /getChatAgents/);
  assert.doesNotMatch(source, /export const CHAT_AGENTS: ChatAgentDefinition\[] = \[/);
});

test('chat shell no longer depends on opening external local agent windows', async () => {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = await readFile(path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx'), 'utf8');

  assert.doesNotMatch(source, /handleOpenLocalAgentInterface/);
  assert.doesNotMatch(source, /chat-local-agent-pane/);
});
