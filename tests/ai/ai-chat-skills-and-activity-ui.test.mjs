import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const chatPath = path.resolve(testDir, '../../src/components/workspace/AIChat.tsx');
const cssPath = path.resolve(testDir, '../../src/components/workspace/AIChat.css');

test('AIChat keeps GN Agent embedded chat focused and opens skills through the icon entry', async () => {
  const source = await readFile(chatPath, 'utf8');
  const css = await readFile(cssPath, 'utf8');

  assert.match(source, /GN Agent/);
  assert.match(source, /GNAgentEmbeddedComposer/);
  assert.match(source, /GNAgentHistoryMenu/);
  assert.match(source, /GNAgentMessageList/);
  assert.match(source, /renderRuntimeApproval/);
  assert.match(source, /GNAgentSkillsEntryButton/);
  assert.match(source, /chat-skills-entry-btn/);
  assert.match(source, /resolveSkillIntent/);
  assert.doesNotMatch(source, /id:\s*'skills'/);
  assert.doesNotMatch(source, /activeAgentLane === 'skills'/);
  assert.doesNotMatch(source, /chat-agent-skills-panel/);
  assert.doesNotMatch(source, /Skill Library/);
  assert.doesNotMatch(source, /GitHub Repo/);
  assert.doesNotMatch(source, /chat-skill-menu/);
  assert.doesNotMatch(source, /AIWorkflowWorkbench/);
  assert.doesNotMatch(source, /GNAgent Workspace/);
  assert.doesNotMatch(source, /GNAgent Settings/);

  assert.match(css, /\.chat-skills-entry-btn/);
  assert.match(css, /\.chat-shell-status-pill/);
  assert.match(css, /\.chat-shell-drawer-panel/);
  assert.match(css, /\.chat-composer-hints/);
  assert.match(css, /\.gn-agent-runtime-panel/);
});

