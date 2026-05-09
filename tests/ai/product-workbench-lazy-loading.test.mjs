import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productWorkbenchPath = path.resolve(__dirname, '../../src/components/product/ProductWorkbench.tsx');

test('product workbench lazy-loads heavy knowledge and page panes', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /Suspense/);
  assert.match(source, /const LazyProductKnowledgeWorkspacePane = lazy\(/);
  assert.match(source, /const LazyProductPageWorkspacePane = lazy\(/);
  assert.match(source, /const renderRequirementMain = \(\) => [\s\S]*<LazyProductKnowledgeWorkspacePane/);
  assert.match(source, /const renderPageLibraryMain = \(\) => [\s\S]*<LazyProductPageWorkspacePane/);
  assert.doesNotMatch(
    source,
    /import\s+\{\s*KnowledgeNoteWorkspace\s*\}\s+from ['"]\.\.\/\.\.\/features\/knowledge\/workspace\/KnowledgeNoteWorkspace['"];/
  );
  assert.doesNotMatch(
    source,
    /import\s+\{\s*PageWorkspace\s*\}\s+from ['"]\.\/PageWorkspace['"];/
  );
  assert.doesNotMatch(
    source,
    /import\s+\{\s*Canvas\s*\}\s+from ['"]\.\.\/canvas\/Canvas['"];/
  );
});
