import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storePath = path.resolve(__dirname, '../../src/modules/ai/claudian/claudianShellStore.ts');
const chatPagePath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianChatPage.tsx');
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('claudian shell store tracks dedicated config ids for claude and codex', async () => {
  const source = await readFile(storePath, 'utf8');
  assert.match(source, /claudeConfigId/);
  assert.match(source, /codexConfigId/);
  assert.match(source, /setProviderConfigId/);
});

test('claudian chat page passes provider-specific execution mode and config overrides into AIChat', async () => {
  const source = await readFile(chatPagePath, 'utf8');
  assert.match(source, /runtimeConfigIdOverride/);
  assert.match(source, /providerExecutionMode/);
});

test('ai chat routes claude and codex pages through provider runtimes', async () => {
  const source = await readFile(aiChatPath, 'utf8');
  assert.match(source, /runtimeConfigIdOverride\?: string \| null/);
  assert.match(source, /providerExecutionMode\?: 'claude' \| 'codex' \| null/);
  assert.match(source, /claudeRuntimeExecutor\.executePrompt/);
  assert.match(source, /codexRuntimeExecutor\.executePrompt/);
});
