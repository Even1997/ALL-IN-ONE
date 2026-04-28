import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('product workbench drops legacy knowledge entry/tree/search pipeline from the knowledge lane', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /const serverBackedRequirementDocs = useMemo/);
  assert.doesNotMatch(source, /buildKnowledgeEntries/);
  assert.doesNotMatch(source, /buildKnowledgeTree/);
  assert.doesNotMatch(source, /buildKnowledgeSearchIndex/);
  assert.match(source, /const selectedServerNote = useMemo/);
  assert.match(source, /const filteredServerNotes = useMemo/);
  assert.match(source, /createServerNote = useKnowledgeStore/);
  assert.match(source, /deleteServerNote = useKnowledgeStore/);
});

test('product workbench wires KnowledgeNoteWorkspace with note-first props and actions', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  assert.match(source, /<KnowledgeNoteWorkspace/);
  assert.match(source, /documentEvents=\{documentEvents\}/);
  assert.match(source, /notes=\{serverNotes\}/);
  assert.match(source, /filteredNotes=\{filteredServerNotes\}/);
  assert.match(source, /selectedNote=\{selectedServerNote\}/);
  assert.match(source, /onSelectNote=\{openKnowledgeNote\}/);
  assert.match(source, /onSave=\{handleSaveKnowledgeNote\}/);
  assert.match(source, /onDelete=\{handleDeleteKnowledgeNote\}/);
  assert.match(source, /activeFilter=\{knowledgeFilter\}/);
  assert.match(source, /onFilterChange=\{setKnowledgeFilter\}/);
  assert.match(source, /neighborhoodGraph=\{neighborhoodGraph\}/);
  assert.match(source, /onOpenGlobalWikiGraph=\{\(\) => setSidebarTab\('wiki'\)\}/);
  assert.match(source, /onOrganizeKnowledge=\{handleOrganizeKnowledge\}/);
  assert.match(source, /void handleCreateKnowledgeNote\(\)/);
});

test('product workbench keeps knowledge editing on manual save only', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /lastKnowledgeAutosaveSignatureRef/);
  assert.doesNotMatch(source, /handleSaveKnowledgeContent/);
  assert.doesNotMatch(source, /已自动保存到/);
  assert.match(source, /event\.key\.toLowerCase\(\) === 's'/);
  assert.match(source, /void handleSaveKnowledgeNote\(\)/);
});
