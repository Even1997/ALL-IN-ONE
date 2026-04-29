import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productWorkbenchPath = path.resolve(__dirname, '../src/components/product/ProductWorkbench.tsx');
const pageWorkspacePath = path.resolve(__dirname, '../src/components/product/PageWorkspace.tsx');
const appCssPath = path.resolve(__dirname, '../src/App.css');
const chatPath = path.resolve(__dirname, '../src/components/workspace/AIChat.tsx');

test('module list text fields keep local drafts and commit on blur instead of every keystroke', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /const \[textDrafts, setTextDrafts\] = useState/);
  assert.match(source, /const handleTextDraftChange = useCallback/);
  assert.match(source, /const handleTextFieldCommit = useCallback/);
  assert.match(source, /value=\{textDrafts\.name\}/);
  assert.match(source, /onChange=\{\(event\) => handleTextDraftChange\('name', event\.target\.value\)\}/);
  assert.match(source, /onBlur=\{\(\) => handleTextFieldCommit\('name'\)\}/);
  assert.doesNotMatch(source, /onChange=\{\(event\) => handleModuleFieldChange\(\{ name: event\.target\.value \}\)\}/);
  assert.match(source, /value=\{textDrafts\.content\}/);
  assert.match(source, /onChange=\{\(event\) => handleTextDraftChange\('content', event\.target\.value\)\}/);
  assert.match(source, /onBlur=\{\(\) => handleTextFieldCommit\('content'\)\}/);
  assert.doesNotMatch(source, /onChange=\{\(event\) => handleModuleFieldChange\(\{ content: event\.target\.value \}\)\}/);
});

// Regression: committing a module field schedules an autosave. When that saved
// wireframe comes back through currentWireframe, the bridge must not reload the
// same element snapshot because loadFromCode clears selectedElementId and
// collapses the active module card.
test('wireframe sync bridge does not rehydrate the same page snapshot after autosave', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /const isSameHydratedSnapshot =/);
  assert.match(source, /hydratedPageIdRef\.current === nextPageId/);
  assert.match(source, /snapshot === lastWireframeSnapshotRef\.current/);
  assert.match(source, /if \(isSameHydratedSnapshot\) \{\s*return;\s*\}/s);
});

test('knowledge filesystem refresh ignores stale async results from older runs', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /const knowledgeRefreshRequestIdRef = useRef\(0\)/);
  assert.match(source, /const requestId = \+\+knowledgeRefreshRequestIdRef\.current/);
  assert.match(source, /if \(requestId !== knowledgeRefreshRequestIdRef\.current\) \{\s*return;\s*\}/s);
  assert.match(source, /setKnowledgeDiskItems\(diskItems\)/);
  assert.match(source, /loadSketchPageArtifactsFromProjectDir/);
  assert.match(source, /replacePageStructure\(sketchArtifacts\.pageStructure,\s*tree\)/);
  assert.match(source, /replaceWireframes\(sketchArtifacts\.wireframes,\s*tree\)/);
  assert.doesNotMatch(source, /buildKnowledgeDocsFromDisk/);
  assert.doesNotMatch(source, /syncServerNotes/);
});

test('knowledge note hydration preserves local drafts for metadata-only refreshes', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /const hydratedKnowledgeNoteSignatureRef = useRef\(''\)/);
  assert.match(source, /const nextHydratedSignature = `\$\{selectedServerNote\.id\}:\$\{selectedServerNote\.title\}:\$\{selectedServerNote\.bodyMarkdown\}`;/);
  assert.match(source, /if \(hydratedKnowledgeNoteSignatureRef\.current === nextHydratedSignature\) \{\s*return;\s*\}/s);
  assert.match(source, /setRequirementDraftTitle\(selectedServerNote\.title\)/);
  assert.match(source, /setRequirementDraftContent\(selectedServerNote\.bodyMarkdown\)/);
  assert.doesNotMatch(source, /lastKnowledgeAutosaveSignatureRef/);
});

test('markdown mirror rename syncs only for notes that already have a source file', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /const renameRequirementFile = useCallback\(async \(fromPath: string, toPath: string\) =>/);
  assert.match(source, /invoke<\{ success: boolean; content: string; error: string \| null \}>\('tool_rename'/);
  assert.match(source, /const shouldSyncMarkdownMirror = Boolean\(canPersistRequirementToDisk && selectedServerNote\.sourceUrl && nextFilePath\)/);
  assert.match(source, /await updateServerNote\(currentProject\.id,\s*selectedServerNote\.id,/);
  assert.match(source, /await writeRequirementFile\(currentFilePath,\s*requirementDraftContent\);\s*await renameRequirementFile\(currentFilePath,\s*nextFilePath\);/s);
  assert.doesNotMatch(source, /await removeRequirementFile\(currentFilePath\);\s*\}/s);
});

test('product workbench uses an in-app confirmation dialog for destructive deletes', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  const noteDeleteStart = source.indexOf('const handleDeleteKnowledgeNote = useCallback');
  const noteDeleteEnd = source.indexOf('const handleCreateKnowledgeNote = useCallback', noteDeleteStart);
  const noteDeleteSource = source.slice(noteDeleteStart, noteDeleteEnd);
  const pageDeleteStart = source.indexOf('const handleDeletePageById = useCallback');
  const pageDeleteEnd = source.indexOf('const handleAddModule = useCallback', pageDeleteStart);
  const pageDeleteSource = source.slice(pageDeleteStart, pageDeleteEnd);

  assert.match(source, /import \{ MacDialog \} from '\.\.\/ui\/MacDialog'/);
  assert.match(source, /pendingDeleteRequest/);
  assert.match(source, /<MacDialog/);
  assert.match(source, /确认删除/);
  assert.match(source, /删除笔记/);
  assert.match(source, /删除页面/);
  assert.match(source, /删除模块/);
  assert.doesNotMatch(noteDeleteSource, /window\.confirm/);
  assert.doesNotMatch(pageDeleteSource, /window\.confirm/);
});

test('page workspace writes sketch page create and delete actions through real files', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /writeSketchPageFile/);
  assert.match(source, /deleteSketchPageFile/);
  assert.match(source, /await writeSketchPageFile\(currentProject\.id,/);
  assert.match(source, /await deleteSketchPageFile\(currentProject\.id,\s*request\.id\)/);
});

test('page workspace falls back to in-memory page actions when Tauri runtime is unavailable', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /isTauriRuntimeAvailable/);
  assert.match(source, /if \(!canUseProjectFilesystem\) \{\s*const nextPage = addRootPage\(\);/s);
  assert.match(source, /if \(!canUseProjectFilesystem\) \{\s*const nextPage = addSiblingPage\(_pageId\);/s);
  assert.match(source, /if \(!canUseProjectFilesystem\) \{\s*const nextPage = addChildPage\(_pageId\);/s);
  assert.match(source, /if \(!canUseProjectFilesystem\) \{\s*deletePageStructureNode\(request\.id\);/s);
});

test('page workspace preserves current canvas and sketch persistence hooks', async () => {
  const workspaceSource = await readFile(pageWorkspacePath, 'utf8');
  const productSource = await readFile(productWorkbenchPath, 'utf8');

  assert.match(workspaceSource, /pm-page-workspace-shell/);
  assert.doesNotMatch(workspaceSource, /Milkdown/);
  assert.match(productSource, /Canvas/);
  assert.match(productSource, /writeSketchPageFile/);
  assert.match(productSource, /deleteSketchPageFile/);
  assert.match(productSource, /loadSketchPageArtifactsFromProjectDir/);
  assert.match(productSource, /<PageWorkspace/);
});

test('knowledge base searches database notes and keeps filters in the note workspace', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /const \[knowledgeSearch, setKnowledgeSearch\] = useState\(''\)/);
  assert.match(source, /const serverSearchResults = useKnowledgeStore\(\(state\) => state\.searchResults\)/);
  assert.match(source, /const searchServerNotes = useKnowledgeStore\(\(state\) => state\.searchNotes\)/);
  assert.match(source, /const filteredServerNotes = useMemo/);
  assert.match(source, /filterKnowledgeNotesByType\(searchedNotes,\s*knowledgeFilter\)/);
  assert.match(source, /searchValue=\{knowledgeSearch\}/);
  assert.match(source, /onSearchChange=\{setKnowledgeSearch\}/);
  assert.doesNotMatch(source, /buildKnowledgeSearchIndex/);
  assert.doesNotMatch(source, /searchKnowledgeEntries/);
  assert.doesNotMatch(source, /renderKnowledgeTree/);
  assert.doesNotMatch(source, /placeholder="搜索文档"/);
  assert.doesNotMatch(source, /设为当前/);
  assert.doesNotMatch(source, /知识库引用/);
  assert.doesNotMatch(source, /AI 会优先读取当前文档/);
});

test('chat sidebar reserves right-side space without changing vertical layout', async () => {
  const source = await readFile(appCssPath, 'utf8');

  assert.match(source, /body\.ai-chat-sidebar-expanded\s+\.app-main\s*{[^}]*padding-right:\s*calc\(var\(--ai-chat-sidebar-width-expanded\)/s);
  assert.match(source, /body\.ai-chat-sidebar-collapsed\s+\.app-main\s*{[^}]*padding-right:\s*calc\(var\(--ai-chat-sidebar-width-collapsed\)/s);
  assert.doesNotMatch(source, /\.app-main\s*{[^}]*padding-bottom:\s*(172|360|380|388)px/s);
});


test('product knowledge reading view keeps chrome compact for note-first reading', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /上传/);
  assert.match(source, /保存到知识库/);
  assert.match(source, /Markdown 镜像/);
  assert.doesNotMatch(source, /项目内的 Markdown 草稿、说明文档和 HTML 设计稿都统一沉淀在这里。/);
  assert.doesNotMatch(source, /知识库引用/);
  assert.doesNotMatch(source, /AI 会优先读取当前文档/);
  assert.doesNotMatch(source, /人工文档/);
  assert.doesNotMatch(source, /当前选中文档/);
  assert.doesNotMatch(source, /设为当前/);
  assert.doesNotMatch(source, /activeKnowledgeFileId === selectedRequirement\.id \? '当前'/);
  assert.doesNotMatch(source, /activeKnowledgeFileId === selectedKnowledgeEntry\.id \? '当前'/);
  assert.doesNotMatch(source, /<span>\{selectedRequirement\.title\}<\/span>/);
  assert.doesNotMatch(source, /进入编辑/);
  assert.doesNotMatch(source, /编辑完成后点击保存。/);
  assert.doesNotMatch(source, /handleCreateKnowledgeFile\('project'\)/);
  assert.doesNotMatch(source, /从左侧文件树打开一个 Markdown 文件。/);
});

test('product workbench passes database note search into the note workspace', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /<KnowledgeNoteWorkspace/);
  assert.match(source, /searchValue=\{knowledgeSearch\}/);
  assert.match(source, /onSearchChange=\{setKnowledgeSearch\}/);
  assert.doesNotMatch(source, /className="product-input pm-knowledge-search-input"/);
  assert.doesNotMatch(source, /selectedKnowledgeEntry\.status/);
  assert.doesNotMatch(source, /new Date\(selectedKnowledgeEntry\.updatedAt\)\.toLocaleString\(\)/);
  assert.doesNotMatch(source, /handleCreateKnowledgeFile\('project'\)/);
  assert.doesNotMatch(source, /从左侧文件树打开一个 Markdown 文件。/);
});

test('knowledge note workspace search keeps the header compact in css', async () => {
  const source = await readFile(appCssPath, 'utf8');

  assert.match(source, /\.gn-note-search-row,/);
  assert.match(source, /\.gn-note-search-row \.product-input\s*{/);
});

test('product workbench keeps page and knowledge labels in readable chinese', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /未命名笔记/);
  assert.match(source, /保存到知识库/);
  assert.match(source, /Markdown 镜像/);
  assert.match(source, /添加模块/);
  assert.match(source, /模块清单/);
  assert.match(source, /页面画布/);
  assert.doesNotMatch(source, /鏂板缓鑽夊浘|鏂板缓璁捐|鏂板缓椤圭洰鏂囦欢|妯″潡娓呭崟|椤甸潰鐢诲竷|鍏宠仈鏂囦欢|瀹炴椂棰勮|鍒犻櫎|缂栬緫|鍔犵矖|閾炬帴|鈮\?/);
});

test('markdown reading surfaces use theme tokens instead of fixed dark colors', async () => {
  const source = await readFile(appCssPath, 'utf8');

  assert.match(source, /\.requirement-file-name-input,[\s\S]*?background:\s*var\(--mode-input\)/);
  assert.match(source, /\.requirement-file-name-input,[\s\S]*?color:\s*var\(--mode-text\)/);
  assert.match(source, /\.pm-knowledge-editor-surface\s*{[\s\S]*?background:\s*var\(--mode-panel-alt\)/);
  assert.match(source, /\.pm-knowledge-editor-surface \.ProseMirror\s*{[\s\S]*?color:\s*var\(--mode-text\)/);
  assert.doesNotMatch(source, /\.pm-knowledge-editor-surface\s*{[\s\S]*?background:\s*linear-gradient\(180deg, #12202f 0%, #0f172a 100%\)/);
});

test('ai chat enables knowledge context when database notes are available', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /const effectiveKnowledgeMode = knowledgeEntries\.length > 0 \? 'all' : 'off'/);
  assert.match(source, /resolveKnowledgeSelectionForPrompt/);
});

test('knowledge workbench starts without auto-opening the first knowledge note', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /const \[selectedKnowledgeNoteId, setSelectedKnowledgeNoteId\] = useState<string \| null>\(null\)/);
  assert.doesNotMatch(source, /selectedKnowledgeNoteId \|\| serverNotes\[0\]\?\.id \|\| null/);
  assert.match(source, /setSelectedKnowledgeNoteId\(\(current\) =>\s*current && serverNotes\.some\(\(note\) => note\.id === current\) \? current : null\s*\)/);
});

test('ai chat current reference scope derives from the focused surface instead of accumulated knowledge selections', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /resolveKnowledgeSelectionForPrompt/);
  assert.match(source, /activeKnowledgeFileId:\s*focusedKnowledgeFileId/);
  assert.doesNotMatch(source, /selectedKnowledgeContextIds\.forEach\(\(id\) => ids\.add\(id\)\)/);
});

test('ai chat reference menu wraps actions and keeps selects within the popover width', async () => {
  const source = await readFile(path.resolve(__dirname, '../src/components/workspace/AIChat.css'), 'utf8');

  assert.match(source, /\.chat-reference-menu\s*{[\s\S]*?width:\s*min\(320px,\s*calc\(100vw - 32px\)\)/);
  assert.match(source, /\.chat-reference-menu\s*{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(source, /\.chat-reference-menu-select\s*{[\s\S]*?min-width:\s*0/);
  assert.match(source, /\.chat-reference-menu-select select\s*{[\s\S]*?width:\s*100%/);
});



