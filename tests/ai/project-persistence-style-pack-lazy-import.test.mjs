import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const persistencePath = path.resolve(__dirname, '../../src/utils/projectPersistence.ts');

test('project persistence lazily imports design style-pack helpers', async () => {
  const source = await readFile(persistencePath, 'utf8');

  assert.match(source, /const loadStylePackModule = \(\) =>/);
  assert.match(source, /import\('\.\.\/modules\/design\/stylePack\.ts'\)/);
  assert.doesNotMatch(source, /import\s+\{\s*getBuiltInStylePackFiles,\s*parseDesignStyleMarkdown,\s*type DesignStyleSeed,\s*\}\s+from ['"]\.\.\/modules\/design\/stylePack\.ts['"]/);
});
