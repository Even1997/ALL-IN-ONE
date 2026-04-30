import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiWorkspacePath = path.resolve(__dirname, '../../src/components/ai/AIWorkspace.tsx');
const aiWorkspaceCssPath = path.resolve(__dirname, '../../src/components/ai/AIWorkspace.css');

test('ai workspace mounts the embedded ai chat surface directly', async () => {
  const source = await readFile(aiWorkspacePath, 'utf8');

  assert.match(source, /AIChat/);
  assert.match(source, /variant="gn-agent-embedded"/);
  assert.doesNotMatch(source, /GNAgentWorkspace/);
});

test('ai workspace css keeps only the floating shell wrapper', async () => {
  const source = await readFile(aiWorkspaceCssPath, 'utf8');

  assert.match(source, /\.floating-ai-workspace\s*\{/);
  assert.match(source, /\.ai-workspace-shell\s*\{/);
  assert.match(source, /\.ai-workspace-body > \.chat-shell\s*\{/);
  assert.doesNotMatch(source, /\.gn-agent-header\s*\{/);
  assert.doesNotMatch(source, /\.gn-agent-tab-badge\s*\{/);
});
