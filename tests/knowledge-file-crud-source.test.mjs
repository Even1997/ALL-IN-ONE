import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('product workbench can create ordinary files without forcing a markdown extension', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  assert.match(source, /mode: 'create-note' \| 'create-file' \| 'create-folder' \| 'rename-path'/);
  assert.match(source, /const handleCreateKnowledgeFileAtPath = useCallback/);
  assert.match(source, /mode: 'create-file'/);
  assert.match(source, /selectedExtension\?: string;/);
  assert.match(source, /const DEFAULT_KNOWLEDGE_FILE_EXTENSION = 'txt';/);
  assert.match(source, /const KNOWLEDGE_FILE_EXTENSION_OPTIONS = \['txt', 'md', 'doc', 'docx', 'json', 'html', 'css', 'js', 'ts'\];/);
  assert.match(source, /inputValue: 'new-file'/);
  assert.match(source, /selectedExtension: DEFAULT_KNOWLEDGE_FILE_EXTENSION/);
  assert.match(source, /knowledgePathDialog\.mode === 'create-note'\s*\?\s*normalizeRequirementFilename\(knowledgePathDialog\.inputValue\)\s*:\s*normalizeKnowledgeTreeSegment\(knowledgePathDialog\.inputValue\)/s);
  assert.match(source, /knowledgePathDialog\.mode === 'create-file'\s*\?\s*`\$\{normalizedNameBase\.replace\(\/\\\.\[\^\.]\+\$\/g, ''\)\}\.\$\{knowledgePathDialog\.selectedExtension \|\| DEFAULT_KNOWLEDGE_FILE_EXTENSION\}`/s);
  assert.match(source, /const createKnowledgeFile = useCallback\(async \(filePath: string\) =>/);
  assert.match(source, /if \(extension === 'doc' \|\| extension === 'docx'\) {\s*await createEmptyWordDocument\(filePath\);\s*return;\s*}/s);
  assert.match(source, /else if \(knowledgePathDialog\.mode === 'create-file'\) {\s*await createKnowledgeFile\(nextAbsolutePath\);/s);
  assert.match(source, /knowledgePathDialog\?\.mode === 'create-file' \? \(/);
  assert.match(source, /<select/);
  assert.match(source, /KNOWLEDGE_FILE_EXTENSION_OPTIONS\.map/);
  assert.match(source, /onCreateFileAtPath=\{handleCreateKnowledgeFileAtPath\}/);
});

test('product workbench rename keeps the user supplied suffix instead of normalizing to markdown', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  assert.match(source, /handleRenameKnowledgeTreePath/);
  assert.match(source, /inputValue: normalizedPath\.split\('\/'\)\.pop\(\) \|\| normalizedPath/);
  assert.match(source, /knowledgePathDialog\.mode === 'create-note'\s*\?\s*normalizeRequirementFilename\(knowledgePathDialog\.inputValue\)\s*:\s*normalizeKnowledgeTreeSegment\(knowledgePathDialog\.inputValue\)/s);
  assert.match(source, /await renameRequirementFile\(previousAbsolutePath, nextAbsolutePath\)/);
});
