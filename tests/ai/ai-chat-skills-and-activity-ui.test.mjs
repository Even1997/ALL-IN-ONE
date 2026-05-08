import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const chatPath = path.resolve(testDir, '../../src/components/workspace/AIChat.tsx');
const cssPath = path.resolve(testDir, '../../src/components/workspace/AIChat.css');

test('AIChat keeps GN Agent embedded chat focused while moving management into settings tabs', async () => {
  const source = await readFile(chatPath, 'utf8');
  const css = await readFile(cssPath, 'utf8');

  assert.match(source, /GN Agent/);
  assert.match(source, /GNAgentEmbeddedComposer/);
  assert.match(source, /GNAgentHistoryMenu/);
  assert.match(source, /GNAgentMessageList/);
  assert.match(source, /renderRuntimeApproval/);
  assert.match(source, /const SETTINGS_TABS/);
  assert.match(source, /id:\s*'skills'/);
  assert.match(source, /id:\s*'mcp'/);
  assert.match(source, /GNAgentSkillsPage/);
  assert.match(source, /RuntimeMcpSettingsPage/);
  assert.match(source, /resolveSkillIntent/);
  assert.doesNotMatch(source, /GNAgentSkillsEntryButton/);
  assert.doesNotMatch(source, /activeAgentLane === 'skills'/);
  assert.doesNotMatch(source, /chat-agent-skills-panel/);
  assert.doesNotMatch(source, /GitHub Repo/);
  assert.doesNotMatch(source, /chat-skill-menu/);
  assert.doesNotMatch(source, /AIWorkflowWorkbench/);
  assert.doesNotMatch(source, /GNAgent Workspace/);
  assert.doesNotMatch(source, /GNAgent Settings/);

  assert.match(css, /\.chat-settings-tab/);
  assert.match(css, /\.chat-settings-mcp-page/);
  assert.match(css, /\.chat-shell-status-pill/);
  assert.match(css, /\.chat-shell-drawer-panel/);
  assert.match(css, /\.chat-composer-hints/);
  assert.match(css, /\.gn-agent-runtime-panel/);
});
