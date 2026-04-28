import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('knowledge note workspace no longer imports legacy knowledgeEntries or knowledgeTree types', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /modules\/knowledge\/knowledgeEntries/);
  assert.doesNotMatch(source, /modules\/knowledge\/knowledgeTree/);
  assert.match(source, /type KnowledgeNoteWorkspaceProps =/);
  assert.match(source, /notes: KnowledgeNote\[\]/);
  assert.match(source, /selectedNote: KnowledgeNote \| null/);
  assert.match(source, /onSelectNote: \(noteId: string\) => void/);
});

test('knowledge note workspace renders context panels for similar notes, relationships, and attachments', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /相似笔记/);
  assert.match(source, /关系网络/);
  assert.match(source, /附件资料/);
  assert.match(source, /libraryAttachments/);
  assert.match(source, /onOpenAttachment/);
});
