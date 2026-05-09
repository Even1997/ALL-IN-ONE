import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../../src/App.tsx');

test('desktop app lazy-loads heavy workbench surfaces instead of importing them eagerly', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(source, /lazy,\s*useCallback/);
  assert.match(source, /Suspense/);
  assert.match(source, /const LazyAIWorkspace = lazy\(/);
  assert.match(source, /const LazyWorkspace = lazy\(/);
  assert.match(source, /const LazyProductWorkbench = lazy\(/);
  assert.match(source, /const LazyAgentShellPage = lazy\(/);
  assert.doesNotMatch(source, /import\s+\{\s*AIWorkspace\s*\}\s+from '\.\/components\/ai\/AIWorkspace';/);
  assert.doesNotMatch(source, /import\s+\{\s*Workspace\s*\}\s+from '\.\/components\/workspace';/);
  assert.doesNotMatch(source, /import\s+\{\s*ProductWorkbench\s*\}\s+from '\.\/components\/product\/ProductWorkbench';/);
  assert.doesNotMatch(source, /import\s+\{\s*AgentShellPage\s*\}\s+from '\.\/features\/agent-shell\/pages\/AgentShellPage';/);
});
