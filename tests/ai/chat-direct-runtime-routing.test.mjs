import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('chat delegates runtime direct-chat request building and response normalization to runtime helpers', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /buildRuntimeDirectChatRequest/);
  assert.match(source, /normalizeRuntimeDirectChatResponse/);
  assert.match(source, /const buildDirectChatRequest = \(\) =>\s*buildRuntimeDirectChatRequest\(/);
  assert.match(source, /const normalizedFinalContent = normalizeRuntimeDirectChatResponse\(/);
  assert.doesNotMatch(source, /const buildPromptReferenceContext =/);
  assert.doesNotMatch(source, /const runtimeContext = assembleAgentContext\(/);
  assert.doesNotMatch(source, /const runtimePrompt = buildThreadPrompt\(/);
});
