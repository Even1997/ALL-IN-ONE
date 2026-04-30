import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const claudeStorePath = path.resolve(__dirname, '../../src/modules/ai/provider-sessions/claudeSessionStore.ts');
const codexStorePath = path.resolve(__dirname, '../../src/modules/ai/provider-sessions/codexSessionStore.ts');
const claudeRuntimePath = path.resolve(__dirname, '../../src/modules/ai/gn-agent/runtime/claude/ClaudeRuntime.ts');
const codexRuntimePath = path.resolve(__dirname, '../../src/modules/ai/gn-agent/runtime/codex/CodexRuntime.ts');

test('provider session stores are independent for claude and codex', async () => {
  const claudeSource = await readFile(claudeStorePath, 'utf8');
  const codexSource = await readFile(codexStorePath, 'utf8');
  assert.match(claudeSource, /createClaudeSession/);
  assert.match(codexSource, /createCodexSession/);
  assert.doesNotMatch(claudeSource, /StoredChatMessage/);
  assert.doesNotMatch(codexSource, /StoredChatMessage/);
});

test('claude runtime exposes provider-native execution and session primitives', async () => {
  const source = await readFile(claudeRuntimePath, 'utf8');
  assert.match(source, /executePrompt/);
  assert.match(source, /providerId = 'claude'/);
  assert.match(source, /sessionId/);
  assert.doesNotMatch(source, /StoredChatMessage/);
});

test('codex runtime exposes provider-native execution and session primitives', async () => {
  const source = await readFile(codexRuntimePath, 'utf8');
  assert.match(source, /executePrompt/);
  assert.match(source, /providerId = 'codex'/);
  assert.match(source, /sessionId/);
  assert.doesNotMatch(source, /StoredChatMessage/);
});

