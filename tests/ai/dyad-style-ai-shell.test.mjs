import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const layoutPath = path.resolve(__dirname, '../../src/components/ai/workspaces/ProviderWorkspaceLayout.tsx');
const shellCssPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentShell.css');

test('provider workspace layout exposes dyad-style session sidebar, message viewport, and composer zones', async () => {
  const source = await readFile(layoutPath, 'utf8');
  assert.match(source, /SessionSidebar/);
  assert.match(source, /MessageViewport/);
  assert.match(source, /ComposerToolbar/);
  assert.match(source, /RuntimeStatusBar/);
});

test('ai shell css defines the compact shared panel surface', async () => {
  const source = await readFile(shellCssPath, 'utf8');
  const shellRule = source.match(/\.gn-agent-shell\s*\{([\s\S]*?)\n\}/);
  const shellMainRule = source.match(/\.gn-agent-shell-main\s*\{([\s\S]*?)\n\}/);
  const providerLayoutRule = source.match(/\.gn-agent-shell\s+\.provider-workspace-layout\s*\{([\s\S]*?)\n\}/);
  assert.ok(shellRule, 'expected .gn-agent-shell rule');
  assert.ok(shellMainRule, 'expected .gn-agent-shell-main rule');
  assert.ok(providerLayoutRule, 'expected .gn-agent-shell .provider-workspace-layout rule');
  assert.match(source, /--gn-agent-bg/);
  assert.match(shellRule[1], /display:\s*flex;/);
  assert.match(shellRule[1], /flex-direction:\s*column;/);
  assert.match(shellMainRule[1], /flex:\s*1;/);
  assert.match(shellMainRule[1], /min-height:\s*0;/);
  assert.match(providerLayoutRule[1], /min-height:\s*0;/);
  assert.doesNotMatch(source, /\.gn-agent-launcher-hero\b/);
});

