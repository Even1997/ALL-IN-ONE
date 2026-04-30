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

test('product workbench clears stale outputs when switching retrieval methods', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  const changeStart = source.indexOf('const handleKnowledgeRetrievalMethodChange = useCallback');
  const changeEnd = source.indexOf('useEffect(() => {', changeStart);
  const changeSource = source.slice(changeStart, changeEnd);

  assert.match(source, /removeVaultKnowledgeOutputsExcept/);
  assert.match(changeSource, /await removeVaultKnowledgeOutputsExcept\(projectRootDir,\s*knowledgeRetrievalMethod\)/);
  assert.match(changeSource, /await refreshKnowledgeFilesystem\(\)/);
});

test('product workbench wires KnowledgeNoteWorkspace with minimal note-first props and actions', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  assert.match(source, /<KnowledgeNoteWorkspace/);
  assert.match(source, /notes=\{serverNotes\}/);
  assert.match(source, /filteredNotes=\{filteredServerNotes\}/);
  assert.match(source, /diskItems=\{knowledgeDiskItems\}/);
  assert.match(source, /selectedNote=\{selectedServerNote\}/);
  assert.match(source, /projectRootPath=\{projectRootDir\}/);
  assert.match(source, /onSelectNote=\{openKnowledgeNote\}/);
  assert.match(source, /onCreateNoteAtPath=\{handleCreateKnowledgeNoteAtPath\}/);
  assert.match(source, /onCreateFolderAtPath=\{handleCreateKnowledgeFolderAtPath\}/);
  assert.match(source, /onRenameTreePath=\{handleRenameKnowledgeTreePath\}/);
  assert.match(source, /onDeleteTreePaths=\{handleDeleteKnowledgeTreePaths\}/);
  assert.match(source, /onRefreshFilesystem=\{handleRefreshKnowledgeFilesystem\}/);
  assert.match(source, /onSave=\{handleSaveKnowledgeNote\}/);
  assert.match(source, /onDelete=\{handleDeleteKnowledgeNote\}/);
  assert.match(source, /knowledgeRetrievalMethod=\{currentProject\.knowledgeRetrievalMethod\}/);
  assert.match(source, /onKnowledgeRetrievalMethodChange=\{handleKnowledgeRetrievalMethodChange\}/);
  assert.match(source, /onOrganizeKnowledge=\{handleOrganizeKnowledge\}/);
  assert.match(source, /void handleCreateKnowledgeNote\(\)/);
  assert.doesNotMatch(source, /documentEvents=\{documentEvents\}/);
  assert.doesNotMatch(source, /similarNotes=\{/);
  assert.doesNotMatch(source, /neighborhoodGraph=\{/);
  assert.doesNotMatch(source, /attachments=\{/);
  assert.doesNotMatch(source, /onImportAssets=/);
  assert.doesNotMatch(source, /onUpload=/);
  assert.doesNotMatch(source, /onOpenGlobalWikiGraph=/);
  assert.doesNotMatch(source, /onUseForDesign=/);
});

test('product workbench removes wiki tab and graph workspace from the knowledge lane', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /KnowledgeGraphWorkspace/);
  assert.doesNotMatch(source, /type SidebarTab = 'knowledge' \| 'wiki' \| 'page'/);
  assert.doesNotMatch(source, /sidebarTab === 'wiki'/);
});

test('product workbench extends delete flow for tree paths and batch delete', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  assert.match(source, /type: 'knowledge-tree-paths'/);
  assert.match(source, /paths: string\[\]/);
  assert.match(source, /handleDeleteKnowledgeTreePaths/);
  assert.match(source, /containsFolders:/);
  assert.match(source, /批量删除/);
});

test('product workbench refreshes the project knowledge index directly from the knowledge lane', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  const organizeStart = source.indexOf('const handleOrganizeKnowledge = useCallback');
  const organizeEnd = source.indexOf('const handleKnowledgeRetrievalMethodChange = useCallback', organizeStart);
  const organizeSource = source.slice(organizeStart, organizeEnd);

  assert.match(source, /ensureProjectSystemIndex/);
  assert.match(organizeSource, /if \(!currentProject \|\| !projectRootDir\)/);
  assert.match(organizeSource, /await ensureProjectSystemIndex\(/);
  assert.match(organizeSource, /await refreshKnowledgeFilesystem\(\)/);
  assert.match(organizeSource, /vaultPath: projectRootDir/);
  assert.match(organizeSource, /正在刷新系统索引/);
  assert.match(organizeSource, /系统索引已刷新/);
  assert.match(organizeSource, /系统索引已是最新状态/);
});

test('product workbench keeps knowledge editing on manual save only', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /lastKnowledgeAutosaveSignatureRef/);
  assert.doesNotMatch(source, /handleSaveKnowledgeContent/);
  assert.match(source, /event\.key\.toLowerCase\(\) === 's'/);
  assert.match(source, /void handleSaveKnowledgeNote\(\)/);
});

test('product workbench saves notes to the sidecar before syncing any markdown mirror', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  const saveStart = source.indexOf('const handleSaveKnowledgeNote = useCallback');
  const saveEnd = source.indexOf('useEffect(() => {', saveStart);
  const saveSource = source.slice(saveStart, saveEnd);

  assert.match(saveSource, /await updateServerNote\(currentProject\.id,\s*selectedServerNote\.id,/);
  assert.match(saveSource, /const currentRelativePath = getRelativePathWithinKnowledgeRoots\(/);
  assert.match(saveSource, /currentProject\.vaultPath \|\| null/);
  assert.match(saveSource, /const shouldSyncMarkdownMirror = Boolean\(canPersistRequirementToDisk && nextFilePath\)/);
  assert.match(saveSource, /if \(shouldSyncMarkdownMirror && currentFilePath && currentFilePath !== nextFilePath\)/);
  assert.ok(
    saveSource.indexOf('await updateServerNote') < saveSource.indexOf('shouldSyncMarkdownMirror'),
    'note update should happen before markdown mirror sync'
  );
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
  assert.match(source, /Markdown 镜像文件会保留/);
});
