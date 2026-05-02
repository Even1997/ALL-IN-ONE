import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const agentPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx');

test('AI chat wiring uses agent runtime store, client, context assembler, and project memory runtime', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /useAgentRuntimeStore/);
  assert.match(source, /createEmptyAgentTurnSession/);
  assert.match(source, /reduceAgentTurnSession/);
  assert.match(source, /decideAgentTurnMode/);
  assert.match(source, /upsertTurnSession/);
  assert.match(source, /patchTurnSession/);
  assert.match(source, /executeRuntimePrompt/);
  assert.match(source, /persistRuntimeThread/);
  assert.match(source, /buildRuntimeDirectChatRequest/);
  assert.match(source, /normalizeRuntimeDirectChatResponse/);
  assert.match(source, /buildProjectMemoryEntry/);
  assert.match(source, /bindRuntimeThread/);
  assert.match(source, /threadId: runtimeThreadId \|\| targetSessionId/);
  assert.doesNotMatch(source, /assembleAgentContext/);
  assert.doesNotMatch(source, /buildThreadPrompt/);
});

test('GN agent chat page still routes provider execution mode through the existing UI shell', async () => {
  const source = await readFile(agentPagePath, 'utf8');

  assert.match(source, /providerExecutionMode=/);
  assert.match(source, /runtimeConfigIdOverride=/);
});
