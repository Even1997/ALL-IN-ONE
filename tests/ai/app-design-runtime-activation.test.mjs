import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../../src/App.tsx');

test('app only activates heavy design runtime effects when the design workbench is active', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(source, /const isDesignWorkbenchActive = currentRole === 'design';/);
  assert.match(source, /currentRole === 'design'\s*\n\s*\? <LazyDesignWorkbenchView/);
  assert.doesNotMatch(source, /loadDesignBoardStateFromDisk\(/);
  assert.doesNotMatch(source, /void loadStylePackModule\(\)/);
});
