import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx');
const agentShellPagePath = path.resolve(
  __dirname,
  '../../src/features/agent-shell/pages/AgentShellPage.tsx',
);
const utilitySidebarPath = path.resolve(
  __dirname,
  '../../src/features/agent-shell/components/AgentUtilitySidebar.tsx',
);
const sessionHookPath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent-shell/useGNAgentWorkbenchSession.ts',
);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('GN agent compatibility shell delegates plan actions through the shared workbench session', async () => {
  const [chatPageSource, sessionHookSource, aiChatSource] = await Promise.all([
    readFile(chatPagePath, 'utf8'),
    readFile(sessionHookPath, 'utf8'),
    readFile(aiChatPath, 'utf8'),
  ]);

  assert.match(chatPageSource, /useGNAgentWorkbenchSession/);
  assert.match(chatPageSource, /AgentChatStage/);
  assert.match(chatPageSource, /session=\{session\}/);
  assert.match(sessionHookSource, /AI_CHAT_COMMAND_EVENT/);
  assert.match(sessionHookSource, /prefillChatPrompt\(nextPrompt,\s*true\)/);
  assert.match(sessionHookSource, /Additional guidance:/);
  assert.match(sessionHookSource, /Pause after the current step and wait for more instructions before continuing\./);
  assert.match(aiChatSource, /useAIChatStore/);
});

test('agent utility sidebar renders structured review state for the latest turn session', async () => {
  const source = await readFile(utilitySidebarPath, 'utf8');

  assert.match(source, /latestTurn\?\.plan/);
  assert.match(source, /pendingApprovalCount/);
  assert.match(source, /affectedPaths/);
});

test('agent shell page surfaces utility review instead of legacy floating plan cards', async () => {
  const [pageSource, utilitySidebarSource] = await Promise.all([
    readFile(agentShellPagePath, 'utf8'),
    readFile(utilitySidebarPath, 'utf8'),
  ]);

  assert.match(pageSource, /AgentUtilitySidebar/);
  assert.match(pageSource, /session=\{session\}/);
  assert.match(utilitySidebarSource, /latestTurn\?\.plan/);
  assert.match(utilitySidebarSource, /pendingApprovalCount/);
  assert.doesNotMatch(pageSource, /AgentFloatingPlanCard/);
});
