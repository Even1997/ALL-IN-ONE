import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const coordinatorPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts',
);
const agentPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx');

test('AI chat wiring uses runtime stores, coordinator entry points, and project memory runtime', async () => {
  const source = await readFile(aiChatPath, 'utf8');
  const coordinator = await readFile(coordinatorPath, 'utf8');

  assert.match(source, /useAgentRuntimeStore/);
  assert.match(source, /submitRuntimeChatTurn/);
  assert.match(coordinator, /createEmptyAgentTurnSession/);
  assert.match(coordinator, /reduceAgentTurnSession/);
  assert.match(coordinator, /decideAgentTurnMode/);
  assert.match(coordinator, /upsertTurnSession/);
  assert.match(coordinator, /patchTurnSession/);
  assert.match(source, /executeRuntimePrompt/);
  assert.match(source, /persistRuntimeThread/);
  assert.match(source, /runtimeChatTurnCoordinator/);
  assert.match(coordinator, /runRuntimeChatBuiltInAgentTurn/);
  assert.match(coordinator, /runRuntimeLocalAgentExecution/);
  assert.match(coordinator, /buildAgentContext/);
  assert.match(coordinator, /buildProjectMemoryEntry/);
  assert.match(coordinator, /bindRuntimeThread/);
  assert.match(coordinator, /threadId: runtimeThreadId \|\| targetSessionId/);
  assert.doesNotMatch(source, /assembleAgentContext/);
  assert.doesNotMatch(source, /buildThreadPrompt/);
});

test('GN agent chat page still routes provider execution mode through the existing UI shell', async () => {
  const source = await readFile(agentPagePath, 'utf8');

  assert.match(source, /providerExecutionMode=/);
  assert.match(source, /runtimeConfigIdOverride=/);
});
