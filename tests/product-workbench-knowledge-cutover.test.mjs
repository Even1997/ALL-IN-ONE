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

test('product workbench saves notes to the sidecar before syncing any markdown mirror', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  const saveStart = source.indexOf('const handleSaveKnowledgeNote = useCallback');
  const saveEnd = source.indexOf('useEffect(() => {', saveStart);
  const saveSource = source.slice(saveStart, saveEnd);

  assert.match(saveSource, /await updateServerNote\(currentProject\.id,\s*selectedServerNote\.id,/);
  assert.match(saveSource, /const shouldSyncMarkdownMirror = Boolean\(canPersistRequirementToDisk && selectedServerNote\.sourceUrl && nextFilePath\)/);
  assert.ok(
    saveSource.indexOf('await updateServerNote') < saveSource.indexOf('shouldSyncMarkdownMirror'),
    'note update should happen before markdown mirror sync'
  );
  assert.doesNotMatch(saveSource, /else if \(canPersistRequirementToDisk && nextFilePath\)\s*\{\s*await writeRequirementFile\(nextFilePath,\s*requirementDraftContent\);/s);
});

test('product workbench deletes knowledge notes without deleting markdown mirrors by default', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  const deleteStart = source.indexOf('const handleDeleteKnowledgeNote = useCallback');
  const deleteEnd = source.indexOf('const handleCreateKnowledgeNote = useCallback', deleteStart);
  const deleteSource = source.slice(deleteStart, deleteEnd);
  const confirmStart = source.indexOf('const handleConfirmDelete = useCallback');
  const confirmEnd = source.indexOf('const handleAddModule = useCallback', confirmStart);
  const confirmSource = source.slice(confirmStart, confirmEnd);

  assert.match(deleteSource, /setPendingDeleteRequest\(\{/);
  assert.match(deleteSource, /type: 'knowledge-note'/);
  assert.doesNotMatch(deleteSource, /deleteServerNote/);
  assert.match(confirmSource, /await deleteServerNote\(currentProject\.id,\s*request\.id\)/);
  assert.doesNotMatch(confirmSource, /removeRequirementFile/);
  assert.doesNotMatch(source, /确定删除文件/);
  assert.match(source, /Markdown 镜像文件会保留/);
});
