import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const chatPath = path.resolve(testDir, '../../src/components/workspace/AIChat.tsx');
const cssPath = path.resolve(testDir, '../../src/components/workspace/AIChat.css');

test('AIChat keeps GN Agent lanes focused on chat work and removes embedded skill management', async () => {
  const source = await readFile(chatPath, 'utf8');
  const css = await readFile(cssPath, 'utf8');

  assert.match(source, /GN Agent/);
  assert.match(source, /AgentLaneId/);
  assert.match(source, /GN_AGENT_LANES/);
  assert.match(source, /Chat/);
  assert.match(source, /Tasks/);
  assert.match(source, /Artifacts/);
  assert.match(source, /Context/);
  assert.match(source, /Activity/);
  assert.match(source, /chat-agent-lane-tabs/);
  assert.match(source, /chat-agent-panel/);
  assert.match(source, /GN_AGENT_SUGGESTIONS/);
  assert.match(source, /@skill/);
  assert.doesNotMatch(source, /id:\s*'skills'/);
  assert.doesNotMatch(source, /activeAgentLane === 'skills'/);
  assert.doesNotMatch(source, /chat-agent-skills-panel/);
  assert.doesNotMatch(source, /Skill Library/);
  assert.doesNotMatch(source, /GitHub Repo/);
  assert.doesNotMatch(source, /chat-skill-menu/);
  assert.doesNotMatch(source, /AIWorkflowWorkbench/);
  assert.doesNotMatch(source, /GNAgent Workspace/);
  assert.doesNotMatch(source, /GNAgent Settings/);

  assert.match(css, /\.chat-agent-lane-tabs/);
  assert.match(css, /\.chat-agent-panel/);
  assert.match(css, /\.chat-shell-status-pill/);
  assert.match(css, /\.chat-shell-drawer-panel/);
  assert.match(css, /\.chat-launchpad/);
  assert.match(css, /\.chat-composer-hints/);
});

