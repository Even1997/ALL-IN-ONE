import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiWorkspacePath = path.resolve(__dirname, '../../src/components/ai/AIWorkspace.tsx');
const gnAgentWorkspacePath = path.resolve(__dirname, '../../src/components/ai/GNAgentWorkspace.tsx');
const aiWorkspaceCssPath = path.resolve(__dirname, '../../src/components/ai/AIWorkspace.css');

test('ai workspace mounts the GNAgent surface directly', async () => {
  const source = await readFile(aiWorkspacePath, 'utf8');

  assert.match(source, /GNAgentWorkspace/);
  assert.match(source, /<GNAgentWorkspace mode="panel" \/>/);
  assert.doesNotMatch(source, /Classic/);
});

test('gnAgent workspace follows the source-like header plus single chat view layout', async () => {
  const source = await readFile(gnAgentWorkspacePath, 'utf8');

  assert.match(source, /GNAgentShell/);
  assert.doesNotMatch(source, /'panel' \| 'full-page'/);
  assert.doesNotMatch(source, /mode=\{mode\}/);
  assert.match(source, /<GNAgentShell mode="panel" \/>/);
});

test('ai workspace css includes the GNAgent single-view shell', async () => {
  const source = await readFile(aiWorkspaceCssPath, 'utf8');

  assert.match(source, /\.ai-workspace-shell\s*\{/);
  assert.match(source, /\.gn-agent-header\s*\{/);
  assert.match(source, /\.gn-agent-tab-badge\s*\{/);
  assert.match(source, /\.gn-agent-workspace\s*\{/);
  assert.match(source, /\.gn-agent-context-pane\s*\{/);
  assert.match(source, /\.gn-agent-chat-pane\s*\{/);
});

