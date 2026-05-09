import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../../src/App.tsx');
const navigationPath = path.resolve(__dirname, '../../src/appNavigation.ts');

test('app navigation exposes agent as a top-level desktop role', async () => {
  const source = await readFile(navigationPath, 'utf8');

  assert.match(source, /'agent'/);
  assert.match(source, /agent:\s*'terminal'/);
  assert.match(source, /DESKTOP_PRIMARY_ROLES[\s\S]*'agent'/);
});

test('app routes the agent role to a dedicated lazy workspace page and keeps AI sidebars lazy-loaded', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(source, /LazyAgentShellPage/);
  assert.match(source, /currentRole === 'agent'[\s\S]*renderAgentView\(\)/);
  assert.match(source, /showWorkspaceSidebar = currentRole !== 'agent'/);
  assert.match(source, /<LazyAIWorkspace/);
});
