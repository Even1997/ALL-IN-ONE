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
const sidecarHookPath = path.resolve(__dirname, '../../src/components/workspace/useAIChatSidecarSessionActions.ts');

test('AI chat wiring uses runtime stores, coordinator entry points, and project memory runtime', async () => {
  const [source, coordinator, sidecarHook] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(coordinatorPath, 'utf8'),
    readFile(sidecarHookPath, 'utf8'),
  ]);

  assert.match(source, /useAgentRuntimeStore/);
  assert.match(source, /useAIChatSidecarSessionActions/);
  assert.doesNotMatch(source, /submitRuntimeChatTurn/);
  assert.match(coordinator, /createEmptyAgentTurnSession/);
  assert.match(coordinator, /reduceAgentTurnSession/);
  assert.match(coordinator, /decideAgentTurnMode/);
  assert.match(coordinator, /upsertTurnSession/);
  assert.match(coordinator, /patchTurnSession/);
  assert.match(sidecarHook, /submitRuntimeSidecarTurn/);
  assert.match(sidecarHook, /createRuntimeSidecarSession/);
  assert.match(coordinator, /runRuntimeChatBuiltInAgentTurn/);
  assert.match(coordinator, /runRuntimeLocalAgentExecution/);
  assert.match(coordinator, /buildAgentContext/);
  assert.match(coordinator, /buildProjectMemoryEntry/);
  assert.match(coordinator, /bindRuntimeThread/);
  assert.match(coordinator, /threadId: runtimeThreadId \|\| targetSessionId/);
  assert.doesNotMatch(source, /assembleAgentContext/);
  assert.doesNotMatch(source, /buildThreadPrompt/);
});

test('GN agent chat page still routes provider identity through the existing UI shell', async () => {
  const source = await readFile(agentPagePath, 'utf8');

  assert.match(source, /providerId=\{providerId\}/);
  assert.match(source, /session=\{session\}/);
});
