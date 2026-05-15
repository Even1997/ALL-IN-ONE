import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../../src/App.tsx');
const persistencePath = path.resolve(__dirname, '../../src/utils/projectPersistence.ts');

test('app statically shares AI service while lazily importing design style-pack modules', async () => {
  const [appSource, persistenceSource] = await Promise.all([
    readFile(appPath, 'utf8'),
    readFile(persistencePath, 'utf8'),
  ]);

  assert.match(appSource, /import\s+\{\s*aiService\s*\}\s+from ['"]\.\/modules\/ai\/core\/AIService['"]/);
  assert.doesNotMatch(appSource, /const loadAIServiceModule = \(\) =>/);
  assert.doesNotMatch(appSource, /import\('\.\/modules\/ai\/core\/AIService'\)/);
  assert.doesNotMatch(appSource, /import\(['"]\.\/modules\/design\/stylePack['"]\)/);
  assert.doesNotMatch(appSource, /import\s+\{[\s\S]*stylePack[\s\S]*\}\s+from ['"]\.\/modules\/design\/stylePack['"]/);
  assert.match(persistenceSource, /const loadStylePackModule = \(\) =>/);
  assert.match(persistenceSource, /import\('\.\.\/modules\/design\/stylePack\.ts'\)/);
  assert.doesNotMatch(
    persistenceSource,
    /import\s+\{\s*getBuiltInStylePackFiles,\s*parseDesignStyleMarkdown,\s*type DesignStyleSeed,\s*\}\s+from ['"]\.\.\/modules\/design\/stylePack\.ts['"]/
  );
});
