import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('product workbench can create ordinary files without forcing a markdown extension', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  assert.match(source, /mode: 'create-note' \| 'create-file' \| 'create-folder' \| 'rename-path'/);
  assert.match(source, /const handleCreateKnowledgeFileAtPath = useCallback/);
  assert.match(source, /mode: 'create-file'/);
  assert.match(source, /inputValue: 'new-file\.txt'/);
  assert.match(source, /knowledgePathDialog\.mode === 'create-note'\s*\?\s*normalizeRequirementFilename\(knowledgePathDialog\.inputValue\)\s*:\s*normalizeKnowledgeTreeSegment\(knowledgePathDialog\.inputValue\)/s);
  assert.match(source, /else if \(knowledgePathDialog\.mode === 'create-file'\) {\s*await writeRequirementFile\(nextAbsolutePath, ''\);/s);
  assert.match(source, /onCreateFileAtPath=\{handleCreateKnowledgeFileAtPath\}/);
});

test('product workbench rename keeps the user supplied suffix instead of normalizing to markdown', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  assert.match(source, /handleRenameKnowledgeTreePath/);
  assert.match(source, /inputValue: normalizedPath\.split\('\/'\)\.pop\(\) \|\| normalizedPath/);
  assert.match(source, /knowledgePathDialog\.mode === 'create-note'\s*\?\s*normalizeRequirementFilename\(knowledgePathDialog\.inputValue\)\s*:\s*normalizeKnowledgeTreeSegment\(knowledgePathDialog\.inputValue\)/s);
  assert.match(source, /await renameRequirementFile\(previousAbsolutePath, nextAbsolutePath\)/);
});
