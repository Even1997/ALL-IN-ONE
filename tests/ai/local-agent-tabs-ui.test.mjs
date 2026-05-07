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
const runtimeClientPath = path.resolve(__dirname, '../../src/modules/ai/runtime/agentRuntimeClient.ts');

test('GN Agent keeps local runtimes internal instead of exposing Claude/Codex as primary tabs', async () => {
  const source = await readFile(chatPath, 'utf8');
  const coordinator = await readFile(coordinatorPath, 'utf8');

  assert.match(source, /CHAT_AGENTS/);
  assert.match(source, /selectedChatAgentId/);
  assert.match(source, /getLocalAgentConfigSnapshot/);
  assert.match(coordinator, /prepareRuntimeLocalAgentFlow/);
  assert.match(coordinator, /runRuntimeLocalAgentExecution/);
  assert.match(coordinator, /invoke<LocalAgentCommandResult>\('run_local_agent_prompt'/);
  assert.match(coordinator, /agentId:\s*localExecutionAgentId/);
  assert.match(coordinator, /projectRoot,/);
  assert.doesNotMatch(source, /className="chat-shell-agent-tabs"/);
  assert.doesNotMatch(source, /<AgentIcon agentId=\{agent\.id\} \/>/);
  assert.doesNotMatch(source, /invoke<LocalAgentCommandResult>\('open_local_agent_interface'/);
});

test('built-in AI remains the default execution path', async () => {
  const source = await readFile(chatPath, 'utf8');
  const coordinator = await readFile(coordinatorPath, 'utf8');
  const runtimeClient = await readFile(runtimeClientPath, 'utf8');

  assert.match(source, /useState<ChatAgentId>\('built-in'\)/);
  assert.match(source, /selectedChatAgentId !== 'built-in' && !agentAvailability\[selectedChatAgentId\]\.ready/);
  assert.match(source, /const runtimeProviderId = \(providerExecutionMode \|\| 'built-in'\) as AgentProviderId;/);
  assert.match(coordinator, /runAgentTurn|runRuntimeChatBuiltInAgentTurn/);
  assert.match(coordinator, /runRuntimeChatBuiltInAgentTurn\(\{/);
  assert.match(coordinator, /allowedTools:\s*builtInAllowedTools/);
  assert.match(runtimeClient, /return await aiService\.completeText\(/);
});
