import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx');
const agentShellPagePath = path.resolve(__dirname, '../../src/features/agent-shell/pages/AgentShellPage.tsx');
const statusPanelPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentStatusPanel.tsx');
const tabBadgesPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentTabBadges.tsx');

test('gnAgent compatibility page is a thin wrapper around the shared agent shell stage', async () => {
  const [source, agentShellPageSource] = await Promise.all([
    readFile(chatPagePath, 'utf8'),
    readFile(agentShellPagePath, 'utf8'),
  ]);
  assert.match(source, /AgentChatStage/);
  assert.match(source, /useGNAgentWorkbenchSession/);
  assert.match(agentShellPageSource, /AgentWorkbenchLayout/);
  assert.match(agentShellPageSource, /AgentWorkbenchSidebar/);
  assert.match(agentShellPageSource, /AgentFloatingPlanCard/);
});

test('gnAgent status panel renders recent activity as a prop-driven shell view', async () => {
  const source = await readFile(statusPanelPath, 'utf8');
  assert.match(source, /activityEntries/);
  assert.match(source, /Recent Activity/);
  assert.doesNotMatch(source, /useAIChatStore/);
  assert.doesNotMatch(source, /useAgentRuntimeStore/);
  assert.match(source, /activeLiveState/);
});

test('gnAgent tab badges read sessions from ai chat store', async () => {
  const source = await readFile(tabBadgesPath, 'utf8');
  assert.match(source, /useAIChatStore/);
  assert.match(source, /gn-agent-tab-badge/);
  assert.match(source, /setActiveSession/);
});
