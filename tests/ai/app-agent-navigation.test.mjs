import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../../src/App.tsx');
const navigationPath = path.resolve(__dirname, '../../src/appNavigation.ts');

test('app navigation exposes agent as a top-level desktop role and legacy ai visibility helper', async () => {
  const source = await readFile(navigationPath, 'utf8');

  assert.match(source, /'agent'/);
  assert.match(source, /agent:\s*'terminal'/);
  assert.match(source, /DESKTOP_PRIMARY_ROLES[\s\S]*'agent'/);
  assert.match(source, /roleShowsLegacyAiWorkspace/);
  assert.match(source, /role !== 'design' && role !== 'agent'/);
});

test('app routes the agent role to a dedicated workspace page and keeps AIWorkspace for legacy roles', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(source, /AgentShellPage/);
  assert.match(source, /currentRole === 'agent'[\s\S]*renderAgentView\(\)/);
  assert.match(source, /roleShowsLegacyAiWorkspace\(currentRole\)/);
  assert.match(source, /<AIWorkspace/);
});
