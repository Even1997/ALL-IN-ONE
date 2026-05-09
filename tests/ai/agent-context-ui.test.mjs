import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contextPanelPath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent-shell/GNAgentContextPanel.tsx',
);
const toolCallPanelPath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent-shell/GNAgentToolCallPanel.tsx',
);
const chatPagePath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx',
);
const sessionHookPath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent-shell/useGNAgentWorkbenchSession.ts',
);
const coordinatorPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts',
);
const agentKernelPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/agent-kernel/runAgentTurn.ts',
);
const runtimeStorePath = path.resolve(__dirname, '../../src/modules/ai/runtime/agentRuntimeStore.ts');

test('agent context panel surfaces context section status and budget fields', async () => {
  const source = await readFile(contextPanelPath, 'utf8');

  assert.match(source, /contextSections/);
  assert.match(source, /budget/);
  assert.match(source, /included/);
  assert.match(source, /excluded/);
});

test('agent compatibility page delegates context and tool-call state through the workbench session', async () => {
  const source = await readFile(chatPagePath, 'utf8');
  const sessionHook = await readFile(sessionHookPath, 'utf8');

  assert.match(source, /AgentChatStage/);
  assert.match(source, /useGNAgentWorkbenchSession/);
  assert.match(source, /session=\{session\}/);
  assert.match(sessionHook, /useRuntimeConversationGateway/);
  assert.match(sessionHook, /contextSnapshot:\s*conversation\.contextSnapshot/);
  assert.match(sessionHook, /toolCalls:\s*conversation\.toolCalls/);
  assert.match(sessionHook, /mcpToolCalls:\s*conversation\.mcpToolCalls/);
});

test('agent tool call panel surfaces tool call status and result fields', async () => {
  const source = await readFile(toolCallPanelPath, 'utf8');

  assert.match(source, /toolCalls/);
  assert.match(source, /completed/);
  assert.match(source, /failed/);
  assert.match(source, /blocked/);
});

test('runtime conversation gateway pulls tool calls for the active session', async () => {
  const source = await readFile(sessionHookPath, 'utf8');

  assert.match(source, /useRuntimeConversationGateway/);
  assert.match(source, /toolCalls:\s*conversation\.toolCalls/);
  assert.match(source, /mcpToolCalls:\s*conversation\.mcpToolCalls/);
});

test('agent runtime store tracks tool calls by thread', async () => {
  const source = await readFile(runtimeStorePath, 'utf8');

  assert.match(source, /toolCallsByThread/);
  assert.match(source, /setThreadToolCalls/);
});

test('runtime turn coordination produces and stores context snapshots for the active session', async () => {
  const coordinator = await readFile(coordinatorPath, 'utf8');
  const kernel = await readFile(agentKernelPath, 'utf8');

  assert.match(kernel, /buildAgentContext/);
  assert.match(coordinator, /setThreadContext/);
  assert.match(coordinator, /setThreadContext\(targetSessionId,\s*agentContextSnapshot\)/);
});
