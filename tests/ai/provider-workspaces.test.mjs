import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shellPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentShell.tsx');
const gnAgentChatPagePath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx'
);
const claudeWorkspacePath = path.resolve(__dirname, '../../src/components/ai/workspaces/ClaudeWorkspace.tsx');
const codexWorkspacePath = path.resolve(__dirname, '../../src/components/ai/workspaces/CodexWorkspace.tsx');
const classicWorkspacePath = path.resolve(__dirname, '../../src/components/ai/workspaces/ClassicWorkspace.tsx');

test('GN Agent shell mounts dedicated provider workspaces instead of a single generic chat page', async () => {
  const source = await readFile(shellPath, 'utf8');
  assert.match(source, /ClaudeWorkspace/);
  assert.match(source, /CodexWorkspace/);
  assert.match(source, /ClassicWorkspace/);
});

test('GN Agent chat page keeps only the actionable chat surface', async () => {
  const source = await readFile(gnAgentChatPagePath, 'utf8');
  assert.doesNotMatch(source, /GNAgentStatusPanel/);
  assert.doesNotMatch(source, /GNAgentRuntimeSummary/);
  assert.doesNotMatch(source, /GNAgentRuntimeBinding/);
  assert.match(source, /useGlobalAIStore/);
  assert.match(source, /resolvePreferredConfig/);
  assert.match(source, /runtimeConfigIdOverride = usableBoundConfig\?\.id \|\| preferredConfig\?\.id \|\| null/);
  assert.match(source, /providerId === 'classic' && mode === 'panel'/);
  assert.match(source, /\? 'gn-agent-embedded'/);
  assert.match(source, /providerId === 'classic'/);
  assert.match(source, /\? 'default'/);
  assert.match(source, /: 'provider-embedded';/);
});

test('provider workspaces render GNAgentChatPage directly without demo session chrome', async () => {
  const [claudeSource, codexSource, classicSource] = await Promise.all([
    readFile(claudeWorkspacePath, 'utf8'),
    readFile(codexWorkspacePath, 'utf8'),
    readFile(classicWorkspacePath, 'utf8'),
  ]);

  assert.doesNotMatch(claudeSource, /provider-demo-session-card/);
  assert.doesNotMatch(codexSource, /provider-demo-session-card/);

  assert.match(claudeSource, /<GNAgentChatPage providerId="claude"/);
  assert.match(codexSource, /<GNAgentChatPage providerId="codex"/);
  assert.match(classicSource, /<GNAgentChatPage providerId="classic"/);

  assert.doesNotMatch(claudeSource, /ProviderWorkspaceLayout/);
  assert.doesNotMatch(codexSource, /ProviderWorkspaceLayout/);
  assert.doesNotMatch(classicSource, /AIChat/);
});

