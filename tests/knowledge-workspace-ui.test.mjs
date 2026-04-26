import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productPath = path.resolve(__dirname, '../src/components/product/ProductWorkbench.tsx');

test('product workbench delegates shell and workspace responsibilities to focused child components', async () => {
  const source = await readFile(productPath, 'utf8');

  assert.match(source, /import\s+\{\s*WorkbenchShell\s*\}\s+from '\.\/WorkbenchShell'/);
  assert.match(source, /import\s+\{\s*KnowledgeWorkspace\s*\}\s+from '\.\/KnowledgeWorkspace'/);
  assert.match(source, /import\s+\{\s*PageWorkspace\s*\}\s+from '\.\/PageWorkspace'/);
  assert.match(source, /<WorkbenchShell/);
  assert.match(source, /<KnowledgeWorkspace/);
  assert.match(source, /<PageWorkspace/);
});
