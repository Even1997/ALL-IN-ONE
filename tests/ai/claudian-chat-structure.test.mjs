import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPagePath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianChatPage.tsx');
const statusPanelPath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianStatusPanel.tsx');
const tabBadgesPath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianTabBadges.tsx');

test('claudian chat page includes a status panel above the chat shell', async () => {
  const source = await readFile(chatPagePath, 'utf8');
  assert.match(source, /ClaudianStatusPanel/);
  assert.match(source, /className="claudian-shell-chat-stack"/);
});

test('claudian status panel reads recent activity from ai chat store', async () => {
  const source = await readFile(statusPanelPath, 'utf8');
  assert.match(source, /activityEntries/);
  assert.match(source, /Recent Activity/);
  assert.match(source, /useAIChatStore/);
});

test('claudian tab badges read sessions from ai chat store', async () => {
  const source = await readFile(tabBadgesPath, 'utf8');
  assert.match(source, /useAIChatStore/);
  assert.match(source, /claudian-tab-badge/);
  assert.match(source, /setActiveSession/);
});
