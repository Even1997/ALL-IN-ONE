import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../../src/App.tsx');

test('app lazy-loads the heavy design workbench surface instead of inlining it in App', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(source, /const LazyDesignWorkbenchView = lazy\(/);
  assert.match(source, /import\('\.\/components\/design\/DesignWorkbenchScreen'\)/);
  assert.match(source, /currentRole === 'design'\s*\?\s*<LazyDesignWorkbenchView/);
  assert.doesNotMatch(source, /const renderDesignView = \(\) => \(/);
});
