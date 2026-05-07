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
const runtimeSummaryPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx');
const builtInTurnPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts',
);
const skillPreparationPath = path.resolve(
  __dirname,
  '../../src/modules/ai/skills/runtimeSkillPreparation.ts',
);

test('runtime ui wiring references active skills and mcp state', async () => {
  const aiChat = await readFile(aiChatPath, 'utf8');
  const coordinator = await readFile(coordinatorPath, 'utf8');
  const summary = await readFile(runtimeSummaryPath, 'utf8');
  const builtInTurn = await readFile(builtInTurnPath, 'utf8');
  const skillPreparation = await readFile(skillPreparationPath, 'utf8');

  assert.match(aiChat, /activeSkills|runtimeMcp/i);
  assert.match(aiChat, /createRuntimeSkillRegistry/);
  assert.match(aiChat, /invokeRuntimeMcpTool/);
  assert.match(aiChat, /parseRuntimeMcpCommand/);
  assert.match(coordinator, /runRuntimeChatMcpTurn/);
  assert.match(coordinator, /buildMcpLifecycleStartDescriptor/);
  assert.match(coordinator, /buildSkillActivationLifecycleDescriptor/);
  assert.match(aiChat, /buildSkillDiscoveryLifecycleDescriptor/);
  assert.match(aiChat, /buildSkillLoadLifecycleDescriptor/);
  assert.match(coordinator, /buildSkillHookLifecycleDescriptor/);
  assert.match(coordinator, /buildMemoryReadLifecycleDescriptor/);
  assert.match(aiChat, /buildMemoryRollbackLifecycleDescriptor/);
  assert.match(aiChat, /loadRuntimeSkillCatalog/);
  assert.match(aiChat, /replayRecoveryController\.appendAndSync/);
  assert.match(builtInTurn, /createRuntimeSkillHookRunner/);
  assert.match(builtInTurn, /onSkillHookEvent/);
  assert.match(skillPreparation, /onHookEvent/);
  assert.match(summary, /skill|mcp/i);
  assert.match(summary, /toolCallsByThread|mcpCalls/i);
});
