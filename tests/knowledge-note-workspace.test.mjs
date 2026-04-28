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

  assert.match(source, /similarNotes/);
  assert.match(source, /documentEvents/);
  assert.match(source, /neighborhoodGraph/);
  assert.match(source, /libraryAttachments/);
  assert.match(source, /onOpenAttachment/);
});

test('knowledge note workspace exposes organize action, current-note graph, and doc-type filters', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /onOrganizeKnowledge: \(\) => void/);
  assert.match(source, /activeFilter: KnowledgeNoteFilter/);
  assert.match(source, /onFilterChange: \(filter: KnowledgeNoteFilter\) => void/);
  assert.match(source, /neighborhoodGraph: KnowledgeNeighborhoodGraph \| null/);
  assert.match(source, /onOpenGlobalWikiGraph: \(\) => void/);
  assert.match(source, /<KnowledgeGraphCanvas/);
  assert.match(source, /mode="focused"/);
  assert.match(source, /onSelectNode=\{onSelectNote\}/);
  assert.match(source, /onClick=\{onOpenGlobalWikiGraph\}/);
  assert.match(source, /Wiki/);
});

test('knowledge note tree stays navigation-only without content previews', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  const listStart = source.indexOf('<div className="gn-note-list">');
  const listEnd = source.indexOf('</aside>', listStart);
  const listSource = source.slice(listStart, listEnd);

  assert.match(source, /NOTE_TREE_SECTIONS/);
  assert.match(listSource, /gn-note-tree-section/);
  assert.match(listSource, /gn-note-tree-match/);
  assert.doesNotMatch(listSource, /summarizeBody\(note\.bodyMarkdown\)/);
  assert.doesNotMatch(listSource, /note\.matchSnippet \|\| summarizeBody/);
  assert.doesNotMatch(listSource, /gn-note-list-meta/);
});

test('knowledge note workspace exposes a read-only document activity panel', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /documentEvents: DocumentChangeEvent\[\]/);
  assert.match(source, /最近文档变更|鏂囨。鍙樻洿/);
  assert.match(source, /documentEvents\.slice\(0,\s*8\)/);
  assert.match(source, /event\.summary/);
  assert.match(source, /event\.trigger/);
});

test('knowledge note workspace describes manual saves instead of autosave', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /自动保存已开启/);
  assert.match(source, /请手动保存/);
});
