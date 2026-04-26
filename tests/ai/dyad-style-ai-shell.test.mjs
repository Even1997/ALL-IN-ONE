import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const layoutPath = path.resolve(__dirname, '../../src/components/ai/workspaces/ProviderWorkspaceLayout.tsx');
const shellCssPath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianShell.css');

test('provider workspace layout exposes dyad-style session sidebar, message viewport, and composer zones', async () => {
  const source = await readFile(layoutPath, 'utf8');
  assert.match(source, /SessionSidebar/);
  assert.match(source, /MessageViewport/);
  assert.match(source, /ComposerToolbar/);
  assert.match(source, /RuntimeStatusBar/);
});

test('ai shell css defines the compact shared panel surface', async () => {
  const source = await readFile(shellCssPath, 'utf8');
  const shellRule = source.match(/\.claudian-shell\s*\{([\s\S]*?)\n\}/);
  assert.ok(shellRule, 'expected .claudian-shell rule');
  assert.match(source, /--claudian-bg/);
  assert.match(shellRule[1], /display:\s*flex;/);
  assert.match(shellRule[1], /flex-direction:\s*column;/);
  assert.doesNotMatch(source, /\.claudian-launcher-hero\b/);
});
