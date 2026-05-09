import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx');
const planPanelPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentPlanPanel.tsx');
const agentShellPagePath = path.resolve(
  __dirname,
  '../../src/features/agent-shell/pages/AgentShellPage.tsx',
);
const floatingPlanCardPath = path.resolve(
  __dirname,
  '../../src/features/agent-shell/components/AgentFloatingPlanCard.tsx',
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

test('GN agent plan panel renders structured plan state for the latest turn session', async () => {
  const source = await readFile(planPanelPath, 'utf8');

  assert.match(source, /session\?\.plan/);
  assert.match(source, /session\.plan\.steps\.map/);
  assert.match(source, /No structured plan/);
});

test('agent shell page surfaces floating plan review instead of legacy turn summary cards', async () => {
  const [pageSource, floatingCardSource] = await Promise.all([
    readFile(agentShellPagePath, 'utf8'),
    readFile(floatingPlanCardPath, 'utf8'),
  ]);

  assert.match(pageSource, /AgentFloatingPlanCard/);
  assert.match(pageSource, /session=\{session\.latestTurnSession\}/);
  assert.match(pageSource, /onOpenInspector/);
  assert.match(floatingCardSource, /session\?\.plan/);
  assert.match(floatingCardSource, /session\.plan\.steps\.slice\(0,\s*3\)/);
  assert.match(floatingCardSource, /查看完整详情/);
  assert.match(floatingCardSource, /进度 \/ 计划/);
});
