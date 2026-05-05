import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('chat delegates direct-chat execution to orchestration entry points and runtime session helpers', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /executeRuntimeBuiltInAgentTurn/);
  assert.match(source, /runRuntimeLocalAgentExecution/);
  assert.match(source, /createEmptyAgentTurnSession/);
  assert.match(source, /reduceAgentTurnSession/);
  assert.match(source, /decideAgentTurnMode/);
  assert.match(source, /upsertTurnSession/);
  assert.match(source, /patchTurnSession/);
  assert.match(source, /buildAgentContext/);
  assert.doesNotMatch(source, /const buildPromptReferenceContext =/);
  assert.doesNotMatch(source, /const runtimeContext = assembleAgentContext\(/);
  assert.doesNotMatch(source, /const runtimePrompt = buildThreadPrompt\(/);
});
