import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pagePath = path.resolve(__dirname, '../../src/features/agent-shell/pages/AgentShellPage.tsx');
const cssPath = path.resolve(__dirname, '../../src/features/agent-shell/pages/AgentShellPage.css');

test('agent workspace page composes the reusable GN agent pages behind a dedicated tab shell', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /GNAgentChatPage/);
  assert.match(source, /GNAgentConfigPage/);
  assert.match(source, /GNAgentSkillsPage/);
  assert.match(source, /const AGENT_WORKSPACE_TABS/);
  assert.match(source, /id:\s*'chat'/);
  assert.match(source, /id:\s*'claude'/);
  assert.match(source, /id:\s*'codex'/);
  assert.match(source, /id:\s*'skills'/);
  assert.match(source, /id:\s*'config'/);
  assert.match(source, /providerId="classic"/);
  assert.match(source, /providerId="claude"/);
  assert.match(source, /providerId="codex"/);
  assert.match(source, /aria-label="Agent workspace sections"/);
  assert.match(source, /get_agent_shell_settings/);
  assert.match(source, /update_agent_shell_settings/);
});

test('agent workspace page includes first-pass shell styles for the dedicated workspace', async () => {
  const source = await readFile(cssPath, 'utf8');

  assert.match(source, /\.agent-workspace-page\s*\{/);
  assert.match(source, /\.agent-workspace-hero\s*\{/);
  assert.match(source, /\.agent-workspace-tabs\s*\{/);
  assert.match(source, /\.agent-workspace-tab\.active\s*\{/);
  assert.match(source, /\.agent-workspace-content\s*\{/);
  assert.match(source, /\.gn-agent-shell-config-card\s*\{/);
});
