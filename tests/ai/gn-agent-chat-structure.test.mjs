import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx');
const statusPanelPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentStatusPanel.tsx');
const tabBadgesPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentTabBadges.tsx');

test('gnAgent chat page includes a status panel above the chat shell', async () => {
  const source = await readFile(chatPagePath, 'utf8');
  assert.match(source, /GNAgentStatusPanel/);
  assert.match(source, /className="[^"]*gn-agent-shell-chat-stack/);
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
