import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiWorkspacePath = path.resolve(__dirname, '../../src/components/ai/AIWorkspace.tsx');
const claudianWorkspacePath = path.resolve(__dirname, '../../src/components/ai/ClaudianWorkspace.tsx');
const aiWorkspaceCssPath = path.resolve(__dirname, '../../src/components/ai/AIWorkspace.css');

test('ai workspace mounts the Claudian surface directly', async () => {
  const source = await readFile(aiWorkspacePath, 'utf8');

  assert.match(source, /ClaudianWorkspace/);
  assert.match(source, /<ClaudianWorkspace mode="panel" \/>/);
  assert.doesNotMatch(source, /Classic/);
});

test('claudian workspace follows the source-like header plus single chat view layout', async () => {
  const source = await readFile(claudianWorkspacePath, 'utf8');

  assert.match(source, /ClaudianShell/);
  assert.match(source, /className=\{`claudian-workspace claudian-workspace-\$\{mode\}`\}/);
  assert.match(source, /<ClaudianShell mode=\{mode\} \/>/);
});

test('ai workspace css includes the Claudian single-view shell', async () => {
  const source = await readFile(aiWorkspaceCssPath, 'utf8');

  assert.match(source, /\.ai-workspace-shell\s*\{/);
  assert.match(source, /\.claudian-header\s*\{/);
  assert.match(source, /\.claudian-tab-badge\s*\{/);
  assert.match(source, /\.claudian-workspace\s*\{/);
  assert.match(source, /\.claudian-context-pane\s*\{/);
  assert.match(source, /\.claudian-chat-pane\s*\{/);
});
