import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shellPath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianShell.tsx');
const pagePath = path.resolve(__dirname, '../../src/components/ai/ClaudePage.tsx');

test('claudian shell keeps runtime switching and drops launcher chrome', async () => {
  const shellSource = await readFile(shellPath, 'utf8');
  assert.match(shellSource, /<ClaudianModeSwitch compact \/>/);
  assert.match(shellSource, /ClaudianTabBadges/);
  assert.match(shellSource, /className="claudian-header"/);
  assert.match(shellSource, /className="claudian-tab-content-container"/);
  assert.doesNotMatch(shellSource, /claudian-launcher-rail/);
  assert.doesNotMatch(shellSource, /clau\dian-launcher-hero|claudian-launcher-hero/);
  assert.doesNotMatch(shellSource, /claudian-header-runtime-strip/);
  assert.doesNotMatch(shellSource, /GoodNight AI/);
  assert.match(shellSource, /currentMode === 'config'/);
  assert.match(shellSource, /currentMode === 'claude'/);
  assert.match(shellSource, /currentMode === 'codex'/);
});

test('claude page mounts the new claudian shell', async () => {
  const pageSource = await readFile(pagePath, 'utf8');
  assert.match(pageSource, /ClaudianShell/);
});
