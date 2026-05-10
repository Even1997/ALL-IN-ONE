import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx');
const agentShellPagePath = path.resolve(__dirname, '../../src/features/agent-shell/pages/AgentShellPage.tsx');
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

test('gnAgent tab badges read sessions from ai chat store', async () => {
  const source = await readFile(tabBadgesPath, 'utf8');
  assert.match(source, /useAIChatStore/);
  assert.match(source, /gn-agent-tab-badge/);
  assert.match(source, /setActiveSession/);
});
