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
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const runtimeStorePath = path.resolve(__dirname, '../../src/modules/ai/runtime/agentRuntimeStore.ts');

test('agent context panel surfaces context section status and budget fields', async () => {
  const source = await readFile(contextPanelPath, 'utf8');

  assert.match(source, /contextSections/);
  assert.match(source, /budget/);
  assert.match(source, /included/);
  assert.match(source, /excluded/);
});

test('agent chat page wires the context panel into the runtime shell', async () => {
  const source = await readFile(chatPagePath, 'utf8');

  assert.match(source, /GNAgentContextPanel/);
  assert.match(source, /contextByThread\[activeSessionId\]/);
});

test('agent tool call panel surfaces tool call status and result fields', async () => {
  const source = await readFile(toolCallPanelPath, 'utf8');

  assert.match(source, /toolCalls/);
  assert.match(source, /completed/);
  assert.match(source, /failed/);
  assert.match(source, /blocked/);
});

test('agent chat page wires tool calls by active session into the runtime shell', async () => {
  const source = await readFile(chatPagePath, 'utf8');

  assert.match(source, /GNAgentToolCallPanel/);
  assert.match(source, /toolCallsByThread\[activeSessionId\]/);
});

test('agent runtime store tracks tool calls by thread', async () => {
  const source = await readFile(runtimeStorePath, 'utf8');

  assert.match(source, /toolCallsByThread/);
  assert.match(source, /setThreadToolCalls/);
});

test('agent chat submit path produces context snapshots for the active session', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /buildAgentContext/);
  assert.match(source, /setThreadContext/);
  assert.match(source, /setThreadContext\(targetSessionId,/);
});
