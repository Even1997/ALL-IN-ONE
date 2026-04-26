import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../../src/App.tsx');

test('app keeps AI in the shared right pane instead of a dedicated Claude route', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.doesNotMatch(source, /import\s+\{\s*ClaudePage\s*\}\s+from\s+'\.\/components\/ai\/ClaudePage';/);
  assert.doesNotMatch(source, /currentRole === 'ai'/);
  assert.match(source, /const appMainContent = isProjectManagerOpen \?/);
  assert.match(source, /<main className="app-main app-main-desktop">\{appMainContent\}<\/main>/);
  assert.match(source, /<aside className="app-ai-activity-pane">[\s\S]*<AIWorkspace \/>[\s\S]*<\/aside>/);
  assert.match(source, /<AIWorkspace \/>/);
});
