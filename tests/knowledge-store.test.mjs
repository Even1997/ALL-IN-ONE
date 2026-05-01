import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('knowledge store reads markdown notes from the local vault instead of a deleted api client', async () => {
  const source = await readFile(new URL('../src/features/knowledge/store/knowledgeStore.ts', import.meta.url), 'utf8');

  assert.match(source, /collectVaultMarkdownFiles/);
  assert.match(source, /loadProjectIndexFromDisk/);
  assert.match(source, /listProjectDirectory/);
  assert.match(source, /readProjectTextFile/);
  assert.match(source, /parseKnowledgeReferenceTitles/);
  assert.doesNotMatch(source, /\.\.\/api\/knowledgeClient/);
  assert.doesNotMatch(source, /Knowledge sidecar/);
});

test('knowledge store keeps the local note actions and search surface intact', async () => {
  const source = await readFile(new URL('../src/features/knowledge/store/knowledgeStore.ts', import.meta.url), 'utf8');

  assert.match(source, /createProjectNote:\s*\(projectId: string, source: ProjectKnowledgeSource\) => Promise<KnowledgeNote>/);
  assert.match(source, /deleteProjectNote:\s*\(projectId: string, noteId: string\) => Promise<void>/);
  assert.match(source, /searchNotes:\s*\(projectId: string, query: string\) => Promise<void>/);
  assert.match(source, /createProjectNote: async \(_projectId, source\) =>/);
  assert.match(source, /deleteProjectNote: async \(_projectId, noteId\) =>/);
  assert.match(source, /searchNotesByKeyword/);
});
