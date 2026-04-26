import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shellPath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianShell.tsx');
const claudianChatPagePath = path.resolve(
  __dirname,
  '../../src/components/ai/claudian-shell/ClaudianChatPage.tsx'
);
const claudeWorkspacePath = path.resolve(__dirname, '../../src/components/ai/workspaces/ClaudeWorkspace.tsx');
const codexWorkspacePath = path.resolve(__dirname, '../../src/components/ai/workspaces/CodexWorkspace.tsx');
const classicWorkspacePath = path.resolve(__dirname, '../../src/components/ai/workspaces/ClassicWorkspace.tsx');

test('claudian shell mounts dedicated provider workspaces instead of a single generic chat page', async () => {
  const source = await readFile(shellPath, 'utf8');
  assert.match(source, /ClaudeWorkspace/);
  assert.match(source, /CodexWorkspace/);
  assert.match(source, /ClassicWorkspace/);
});

test('claudian chat page keeps only the actionable chat surface', async () => {
  const source = await readFile(claudianChatPagePath, 'utf8');
  assert.doesNotMatch(source, /ClaudianStatusPanel/);
  assert.doesNotMatch(source, /ClaudianRuntimeSummary/);
  assert.doesNotMatch(source, /ClaudianRuntimeBinding/);
});

test('provider workspaces render ClaudianChatPage directly without demo session chrome', async () => {
  const [claudeSource, codexSource, classicSource] = await Promise.all([
    readFile(claudeWorkspacePath, 'utf8'),
    readFile(codexWorkspacePath, 'utf8'),
    readFile(classicWorkspacePath, 'utf8'),
  ]);

  assert.doesNotMatch(claudeSource, /provider-demo-session-card/);
  assert.doesNotMatch(codexSource, /provider-demo-session-card/);

  assert.match(claudeSource, /<ClaudianChatPage providerId="claude"/);
  assert.match(codexSource, /<ClaudianChatPage providerId="codex"/);
  assert.match(classicSource, /<ClaudianChatPage providerId="classic"/);

  assert.doesNotMatch(claudeSource, /ProviderWorkspaceLayout/);
  assert.doesNotMatch(codexSource, /ProviderWorkspaceLayout/);
  assert.doesNotMatch(classicSource, /AIChat/);
});
