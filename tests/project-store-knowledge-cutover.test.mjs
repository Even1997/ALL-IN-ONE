import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('project store no longer falls back to the first RequirementDoc when compatibility docs change', async () => {
  const source = await readFile(new URL('../src/store/projectStore.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /state\.activeKnowledgeFileId === id \? requirementDocs\[0\]\?\.id \|\| null : state\.activeKnowledgeFileId/);
  assert.doesNotMatch(source, /requirementDocs\.some\(\(doc\) => doc\.id === state\.activeKnowledgeFileId\)\s*\?\s*state\.activeKnowledgeFileId\s*:\s*requirementDocs\[0\]\?\.id \|\| null/s);
  assert.match(source, /state\.activeKnowledgeFileId === id \? null : state\.activeKnowledgeFileId/);
  assert.match(source, /requirementDocs\.some\(\(doc\) => doc\.id === state\.activeKnowledgeFileId\)\s*\?\s*state\.activeKnowledgeFileId\s*:\s*null/s);
});
