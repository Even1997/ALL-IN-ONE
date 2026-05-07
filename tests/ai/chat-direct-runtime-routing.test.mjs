import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const coordinatorPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts',
);

test('chat delegates direct-chat execution to coordinator entry points and runtime session helpers', async () => {
  const source = await readFile(chatPath, 'utf8');
  const coordinator = await readFile(coordinatorPath, 'utf8');

  assert.match(source, /runtimeChatTurnCoordinator/);
  assert.match(source, /submitRuntimeChatTurn/);
  assert.match(coordinator, /runRuntimeChatBuiltInAgentTurn/);
  assert.match(coordinator, /runRuntimeLocalAgentExecution/);
  assert.match(coordinator, /createEmptyAgentTurnSession/);
  assert.match(coordinator, /reduceAgentTurnSession/);
  assert.match(coordinator, /decideAgentTurnMode/);
  assert.match(coordinator, /upsertTurnSession/);
  assert.match(coordinator, /patchTurnSession/);
  assert.match(coordinator, /buildAgentContext/);
  assert.doesNotMatch(source, /const buildPromptReferenceContext =/);
  assert.doesNotMatch(source, /const runtimeContext = assembleAgentContext\(/);
  assert.doesNotMatch(source, /const runtimePrompt = buildThreadPrompt\(/);
});

test('chat does not force non-built-in agents into plan mode before the model chooses it', async () => {
  const source = await readFile(chatPath, 'utf8');
  const coordinator = await readFile(coordinatorPath, 'utf8');

  assert.match(coordinator, /suggestedPlanMode:\s*Boolean\(skillIntent\)/);
  assert.match(coordinator, /riskyWriteDetected:\s*false/);
  assert.match(coordinator, /multiStepDetected:\s*Boolean\(mcpCommand\)/);
  assert.doesNotMatch(coordinator, /riskyWriteDetected:\s*runtimeExecutionAgentId !== 'built-in'/);
  assert.doesNotMatch(coordinator, /multiStepDetected:\s*Boolean\(mcpCommand \|\| runtimeExecutionAgentId !== 'built-in'\)/);
});

test('chat built-in execution path can dispatch the agent tool to the team runtime', async () => {
  const source = await readFile(chatPath, 'utf8');
  const coordinator = await readFile(coordinatorPath, 'utf8');

  assert.match(coordinator, /const runBuiltInAgentTool = async \(call: ToolCall\): Promise<ToolResult> =>/);
  assert.match(coordinator, /call\.name === 'agent'\s*\?\s*runBuiltInAgentTool\(call\)/);
});
