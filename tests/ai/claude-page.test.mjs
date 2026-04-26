import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appNavigationPath = path.resolve(__dirname, '../../src/appNavigation.ts');
const appPath = path.resolve(__dirname, '../../src/App.tsx');
const claudePagePath = path.resolve(__dirname, '../../src/components/ai/ClaudePage.tsx');
const claudianWorkspacePath = path.resolve(__dirname, '../../src/components/ai/ClaudianWorkspace.tsx');
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('app navigation exposes a dedicated ai role tab', async () => {
  const source = await readFile(appNavigationPath, 'utf8');

  assert.match(source, /'ai'/);
  assert.match(source, /label:\s*'AI'/);
});

test('app routes ai role to a dedicated Claude page without removing the desktop side pane for other roles', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(source, /currentRole === 'ai'\s*\?\s*<ClaudePage \/>/);
  assert.match(source, /const appMainContent = isProjectManagerOpen \?/);
  assert.match(source, /const isAIPage = currentRole === 'ai'/);
  assert.match(source, /!\s*isAIPage\s*\?\s*\(/);
  assert.match(source, /<AIWorkspace \/>/);
});

test('dedicated Claude page renders the Claudian workspace in full-page mode', async () => {
  const source = await readFile(claudePagePath, 'utf8');

  assert.match(source, /className="claude-page"/);
  assert.match(source, /<ClaudianShell mode="full-page" \/>/);
});

test('claudian workspace supports panel and full-page modes', async () => {
  const source = await readFile(claudianWorkspacePath, 'utf8');

  assert.match(source, /mode\?: 'panel' \| 'full-page'/);
  assert.match(source, /<ClaudianShell mode=\{mode\} \/>/);
});

test('ai chat exposes a dedicated claude full-page variant', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /variant\?: 'default' \| 'claudian-embedded' \| 'claudian-full-page'/);
});
