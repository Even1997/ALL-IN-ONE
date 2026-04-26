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
  assert.match(source, /replaceRequirementDocs\(docs\)/);
  assert.match(source, /loadSketchPageArtifactsFromProjectDir/);
  assert.match(source, /replacePageStructure\(sketchArtifacts\.pageStructure,\s*tree\)/);
  assert.match(source, /replaceWireframes\(sketchArtifacts\.wireframes,\s*tree\)/);
});

test('page workspace writes sketch page create and delete actions through real files', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /writeSketchPageFile/);
  assert.match(source, /deleteSketchPageFile/);
  assert.match(source, /await writeSketchPageFile\(currentProject\.id,/);
  assert.match(source, /await deleteSketchPageFile\(currentProject\.id,\s*pageId\)/);
});

test('page workspace falls back to in-memory page actions when Tauri runtime is unavailable', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /isTauriRuntimeAvailable/);
  assert.match(source, /if \(!canUseProjectFilesystem\) \{\s*const nextPage = addRootPage\(\);/s);
  assert.match(source, /if \(!canUseProjectFilesystem\) \{\s*const nextPage = addSiblingPage\(_pageId\);/s);
  assert.match(source, /if \(!canUseProjectFilesystem\) \{\s*const nextPage = addChildPage\(_pageId\);/s);
  assert.match(source, /if \(!canUseProjectFilesystem\) \{\s*deletePageStructureNode\(pageId\);/s);
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

test('knowledge base has searchable filters and visible source summaries', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /const \[knowledgeSearch, setKnowledgeSearch\] = useState\(''\)/);
  assert.match(source, /buildKnowledgeSearchIndex/);
  assert.match(source, /searchKnowledgeEntries/);
  assert.match(source, /const knowledgeSearchState = useMemo/);
  assert.match(source, /const searchedKnowledgeEntries = useMemo/);
  assert.match(source, /const filteredKnowledgeTree = useMemo/);
  assert.match(source, /searchKnowledgeEntries\(knowledgeSearchState, knowledgeSearch\)/);
  assert.match(source, /className="product-input pm-nav-header-search"/);
  assert.match(source, /className="pm-knowledge-tree"/);
  assert.match(source, /renderKnowledgeTree\(filteredKnowledgeTree\)/);
  assert.match(source, /没有匹配的知识条目/);
  assert.doesNotMatch(source, /placeholder="搜索文档"/);
  assert.doesNotMatch(source, /pm-knowledge-workspace-search/);
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


test('product knowledge reading view keeps chrome compact for content-first reading', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /上传/);
  assert.match(source, /Markdown 自动保存已开启/);
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

test('product workbench uses one left-nav search input and removes duplicate in-panel knowledge chrome', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /className="product-input pm-nav-header-search"/);
  assert.match(source, /value=\{sidebarTab === 'requirement' \? knowledgeSearch : pageSearch\}/);
  assert.match(source, /placeholder=\{sidebarTab === 'requirement' \? '搜索文档' : '搜索页面'\}/);
  assert.doesNotMatch(source, /className="product-input pm-knowledge-search-input"/);
  assert.doesNotMatch(source, /className="product-input pm-page-search-input"/);
  assert.doesNotMatch(source, /pm-knowledge-workspace-search/);
  assert.doesNotMatch(source, /selectedKnowledgeEntry\.status/);
  assert.doesNotMatch(source, /new Date\(selectedKnowledgeEntry\.updatedAt\)\.toLocaleString\(\)/);
  assert.doesNotMatch(source, /handleCreateKnowledgeFile\('project'\)/);
  assert.doesNotMatch(source, /从左侧文件树打开一个 Markdown 文件。/);
});

test('product workbench left-nav search keeps the header compact in css', async () => {
  const source = await readFile(appCssPath, 'utf8');

  assert.match(source, /\.pm-nav-header-search\s*{/);
});

test('product workbench keeps page and knowledge labels in readable chinese', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /新建草图\.md/);
  assert.match(source, /新建设计\.md/);
  assert.match(source, /新建项目文件\.md/);
  assert.match(source, /添加模块/);
  assert.match(source, /模块清单/);
  assert.match(source, /页面画布/);
  assert.match(source, /关联文件/);
  assert.match(source, /Ctrl\+S 保存文件名/);
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

test('ai chat supports opened document scope in knowledge mode', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /handleApplyReferenceScope\('open-tabs'\)/);
  assert.match(source, /referenceScopeMode === 'open-tabs'/);
});

test('knowledge workbench starts without auto-opening the first knowledge file', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /const \[selectedKnowledgeNodeId, setSelectedKnowledgeNodeId\] = useState<string \| null>\(null\)/);
  assert.doesNotMatch(source, /selectedKnowledgeNodeId \|\| firstKnowledgeFileNode\?\.id \|\| null/);
  assert.doesNotMatch(source, /setSelectedKnowledgeNodeId\(\(current\) =>\s*current && findKnowledgeTreeNode\(knowledgeTree, current\) \? current : firstKnowledgeFileNode\.id/s);
});

test('ai chat current reference scope derives from the focused surface instead of accumulated knowledge selections', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /resolveCurrentReferenceFileIds/);
  assert.doesNotMatch(source, /selectedKnowledgeContextIds\.forEach\(\(id\) => ids\.add\(id\)\)/);
});

test('ai chat reference menu wraps actions and keeps selects within the popover width', async () => {
  const source = await readFile(path.resolve(__dirname, '../src/components/workspace/AIChat.css'), 'utf8');

  assert.match(source, /\.chat-reference-menu\s*{[\s\S]*?width:\s*min\(320px,\s*calc\(100vw - 32px\)\)/);
  assert.match(source, /\.chat-reference-menu\s*{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(source, /\.chat-reference-menu-select\s*{[\s\S]*?min-width:\s*0/);
  assert.match(source, /\.chat-reference-menu-select select\s*{[\s\S]*?width:\s*100%/);
});



