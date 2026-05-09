import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../../src/App.tsx');
const designWorkbenchViewPath = path.resolve(__dirname, '../../src/components/design/DesignWorkbenchView.tsx');
const designWorkbenchScreenPath = path.resolve(__dirname, '../../src/components/design/DesignWorkbenchScreen.tsx');

test('app lazy loads the dedicated design workbench screen module', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(source, /import\('\.\/components\/design\/DesignWorkbenchScreen'\)/);
});

test('design workbench view stays presentation-only after the screen split', async () => {
  const [viewSource, screenSource] = await Promise.all([
    readFile(designWorkbenchViewPath, 'utf8'),
    readFile(designWorkbenchScreenPath, 'utf8'),
  ]);

  assert.doesNotMatch(viewSource, /type DesignWorkbenchScreenProps = \{/);
  assert.doesNotMatch(viewSource, /export const DesignWorkbenchScreen: React\.FC/);

  assert.match(screenSource, /type DesignWorkbenchScreenProps = \{/);
  assert.match(screenSource, /export const DesignWorkbenchScreen: React\.FC/);
});
