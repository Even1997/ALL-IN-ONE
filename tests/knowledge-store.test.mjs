import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('knowledge client exposes note-first create and delete operations', async () => {
  const source = await readFile(new URL('../src/features/knowledge/api/knowledgeClient.ts', import.meta.url), 'utf8');

  assert.match(source, /export const createProjectKnowledgeNote = async/);
  assert.match(source, /export const deleteProjectKnowledgeNote = async/);
  assert.match(source, /method:\s*'POST'/);
  assert.match(source, /method:\s*'DELETE'/);
});

test('knowledge store exposes create and delete actions for note-first workflows', async () => {
  const source = await readFile(new URL('../src/features/knowledge/store/knowledgeStore.ts', import.meta.url), 'utf8');

  assert.match(source, /createProjectNote:\s*\(projectId: string, source: ProjectKnowledgeSource\) => Promise<KnowledgeNote>/);
  assert.match(source, /deleteProjectNote:\s*\(projectId: string, noteId: string\) => Promise<void>/);
  assert.match(source, /createProjectNote: async \(projectId, source\) =>/);
  assert.match(source, /deleteProjectNote: async \(projectId, noteId\) =>/);
});
