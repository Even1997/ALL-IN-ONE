import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('knowledge note workspace drops legacy knowledge entries while accepting disk tree input', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /modules\/knowledge\/knowledgeEntries/);
  assert.match(source, /import type \{ KnowledgeDiskItem \} from '\.\.\/\.\.\/\.\.\/modules\/knowledge\/knowledgeTree';/);
  assert.match(source, /type KnowledgeNoteWorkspaceProps =/);
  assert.match(source, /notes: KnowledgeNote\[\]/);
  assert.match(source, /diskItems: KnowledgeDiskItem\[\]/);
  assert.match(source, /selectedNote: KnowledgeNote \| null/);
  assert.match(source, /onSelectNote: \(noteId: string\) => void/);
  assert.doesNotMatch(source, /KnowledgeNoteFilter/);
  assert.doesNotMatch(source, /FILTER_OPTIONS/);
});

test('knowledge note workspace accepts and renders a temporary content preview above the editor column', async () => {
  const noteSource = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');
  const css = noteSource;

  assert.match(noteSource, /temporaryContentPreview\?:/);
  assert.match(noteSource, /gn-note-temporary-preview/);
  assert.match(css, /\.gn-note-temporary-preview/);
});

test('knowledge note workspace removes auxiliary context panels in minimalist mode', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /similarNotes/);
  assert.doesNotMatch(source, /documentEvents/);
  assert.doesNotMatch(source, /neighborhoodGraph/);
  assert.doesNotMatch(source, /libraryAttachments/);
  assert.match(source, /onOpenAttachment: \(attachmentPath: string\) => void/);
  assert.doesNotMatch(source, /onImportAssets/);
  assert.doesNotMatch(source, /onUpload/);
  assert.doesNotMatch(source, /onUseForDesign/);
});

test('knowledge note workspace removes organize, filter, and graph-only controls', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /onOrganizeKnowledge: \(\) => void/);
  assert.doesNotMatch(source, /activeFilter:/);
  assert.doesNotMatch(source, /onFilterChange:/);
  assert.doesNotMatch(source, /pm-knowledge-filter-tabs/);
  assert.doesNotMatch(source, /m-flow/i);
  assert.doesNotMatch(source, /knowledgeRetrievalMethod/);
  assert.doesNotMatch(source, /onKnowledgeRetrievalMethodChange/);
  assert.doesNotMatch(source, /KnowledgeGraphCanvas/);
  assert.doesNotMatch(source, /onOpenGlobalWikiGraph/);
});

test('knowledge note tree stays navigation-only while preserving generic note classification', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  const listStart = source.indexOf('<div className="gn-note-list">');
  const listEnd = source.indexOf('</aside>', listStart);
  const listSource = source.slice(listStart, listEnd);

  assert.match(source, /projectRootPath\?: string \| null/);
  assert.match(source, /buildKnowledgeTree/);
  assert.match(source, /toggleFolderExpanded/);
  assert.match(source, /gn-note-tree-item folder/);
  assert.match(source, /gn-note-tree-children/);
  assert.match(source, /gn-note-tree-match/);
  assert.match(source, /gn-note-tree-badge/);
  assert.doesNotMatch(source, /系统索引/);
  assert.doesNotMatch(source, /AI 摘要/);
  assert.doesNotMatch(source, /NOTE_TREE_SECTIONS/);
  assert.doesNotMatch(listSource, /gn-note-tree-section/);
  assert.doesNotMatch(listSource, /summarizeBody\(note\.bodyMarkdown\)/);
  assert.doesNotMatch(listSource, /note\.matchSnippet \|\| summarizeBody/);
  assert.doesNotMatch(listSource, /gn-note-list-meta/);
});

test('knowledge note workspace exposes file-tree management hooks for context menus and batch delete', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /diskItems: KnowledgeDiskItem\[\]/);
  assert.match(source, /onCreateNoteAtPath: \(relativeDirectory: string \| null\) => void/);
  assert.match(source, /onCreateFolderAtPath: \(relativeDirectory: string \| null\) => void/);
  assert.match(source, /onRenameTreePath: \(relativePath: string, isFolder: boolean\) => void/);
  assert.match(source, /onDeleteTreePaths: \(relativePaths: string\[\] \| string, isFolder: boolean \| null\) => void/);
  assert.match(source, /onRefreshFilesystem: \(\) => void/);
  assert.match(source, /onContextMenu=/);
  assert.match(source, /selectedTreePaths/);
  assert.match(source, /contextMenuState/);
  assert.match(source, /pm-knowledge-context-menu/);
  assert.match(source, /contextMenuRef = useRef<HTMLDivElement \| null>\(null\)/);
  assert.match(source, /contextMenuRef\.current\?\.contains\(event\.target\)/);
});

test('knowledge note tree separates current active note from explicit multi-select state', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /const \[activeTreePath, setActiveTreePath\] = useState<string \| null>\(null\);/);
  assert.match(source, /const isMultiSelecting = selectedTreePaths\.length > 1;/);
  assert.match(source, /const isActive = isMultiSelecting && isSelected;/);
  assert.match(
    source,
    /className=\{`gn-note-tree-item folder \$\{isActive \? 'active' : ''\}`\}/
  );
  assert.match(source, /setSelectedTreePaths\(\[\]\);\s*setAnchorTreePath\(childFolder\.path\);\s*setActiveTreePath\(null\);/s);
  assert.match(source, /const isCurrentNote = activeTreePath === file\.path;/);
  assert.match(source, /const isActive = isCurrentNote \|\| \(isMultiSelecting && isSelected\);/);
  assert.match(
    source,
    /className=\{`gn-note-tree-item file \$\{isActive \? 'active' : ''\}`\}/
  );
  assert.match(source, /setSelectedTreePaths\(\[\]\);\s*setAnchorTreePath\(file\.path\);\s*setActiveTreePath\(file\.path\);/s);
});

test('knowledge note tree does not force ancestor folders open after selection so users can collapse them', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /const selectedAncestorFolderPaths = useMemo\(/);
  assert.match(source, /setCollapsedFolderPaths\(\(current\) => \{/);
  assert.match(source, /const next = new Set\(current\);/);
  assert.match(source, /for \(const ancestorPath of selectedAncestorFolderPaths\) \{/);
  assert.match(source, /next\.delete\(ancestorPath\);/);
  assert.match(source, /const isExpanded = !collapsedFolderPaths\.has\(childFolder\.path\);/);
  assert.doesNotMatch(
    source,
    /selectedAncestorFolderPaths\.has\(childFolder\.path\) \|\| !collapsedFolderPaths\.has\(childFolder\.path\)/
  );
});

test('knowledge note workspace no longer exposes the activity side panel', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /DocumentChangeEvent/);
  assert.doesNotMatch(source, /documentEvents\.slice\(0,\s*8\)/);
  assert.doesNotMatch(source, /event\.summary/);
  assert.doesNotMatch(source, /event\.trigger/);
});

test('knowledge note workspace describes database saves instead of autosave', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /autosave/i);
  assert.match(source, /Markdown/);
});

test('knowledge note workspace keeps generic metadata basics without doc-type-specific wording or reference-heavy detail panes', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /referenceTitles/);
  assert.doesNotMatch(source, /selectedNote\.referenceTitles/);
  assert.match(source, /mirrorSourcePath/);
  assert.match(source, /getNoteMeta/);
  assert.match(source, /项目笔记/);
  assert.match(source, /系统生成/);
  assert.doesNotMatch(source, /系统索引/);
  assert.doesNotMatch(source, /AI 摘要/);
});

test('knowledge note workspace defaults to reading mode and exposes a code toggle for markdown editing', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /type KnowledgeViewMode = 'read' \| 'code'/);
  assert.match(source, /useState<KnowledgeViewMode>\('read'\)/);
  assert.match(source, /setViewMode\('read'\)/);
  assert.match(source, /KnowledgeMarkdownViewer/);
  assert.match(source, /GoodNightMarkdownEditor/);
  assert.match(source, /serializeKnowledgeNoteMarkdown/);
  assert.match(source, /splitKnowledgeNoteEditorDocument/);
  assert.match(source, /className="gn-note-code-textarea"/);
});

test('knowledge note workspace previews unmapped markdown files inside the app instead of opening them as attachments', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /type RawMarkdownPreview =/);
  assert.match(source, /const isPreviewableKnowledgeFile = \(extension: string\)/);
  assert.match(source, /else if \(isPreviewableKnowledgeFile\(file\.extension\)\) {\s*void handleOpenRawMarkdownPreview\(file\);\s*} else {\s*onOpenAttachment\(file\.absolutePath\);\s*}/s);
  assert.match(source, /rawMarkdownPreview \? \(/);
  assert.match(source, /Markdown/);
});

test('knowledge note workspace empty state stays vault-first', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /选择或新建一条/);
  assert.match(source, /新建笔记/);
  assert.doesNotMatch(source, /刷新 m-flow/);
  assert.doesNotMatch(source, /知识图谱/);
});

test('knowledge note workspace adds tree toolbar actions for folder creation, sorting, and expand collapse all', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /type KnowledgeTreeSortMode =/);
  assert.match(source, /const KNOWLEDGE_TREE_SORT_OPTIONS = \[/);
  assert.match(source, /useState<KnowledgeTreeSortMode>\('name-asc'\)/);
  assert.match(source, /onCreateFolderAtPath\(null\)/);
  assert.match(source, /const allVisibleFolderPaths = useMemo\(/);
  assert.match(source, /const allFoldersCollapsed =/);
  assert.match(source, /const handleToggleAllFolders = useCallback\(/);
  assert.match(source, /className="doc-action-btn gn-note-icon-btn"/);
  assert.match(source, /gn-note-icon-select/);
  assert.match(source, /gn-note-icon-select-input/);
  assert.match(source, /title="知识库排序"/);
  assert.match(source, /aria-label="知识库排序"/);
  assert.match(source, /文件名\(A-Z\)/);
  assert.match(source, /文件名\(Z-A\)/);
  assert.match(source, /编辑时间\(从新到旧\)/);
  assert.match(source, /编辑时间\(从旧到新\)/);
  assert.match(source, /创建时间\(从新到旧\)/);
  assert.match(source, /创建时间\(从旧到新\)/);
  assert.match(source, /title="新建文件夹"/);
  assert.match(source, /aria-label="新建文件夹"/);
  assert.match(source, /onClick=\{handleToggleAllFolders\}/);
  assert.match(source, /title=\{allFoldersCollapsed \? '全部展开' : '全部折叠'\}/);
  assert.match(source, /aria-label=\{allFoldersCollapsed \? '全部展开' : '全部折叠'\}/);
});

test('knowledge note workspace sorting supports note create and update timestamps with fallback metadata for unmapped files', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /createdAt\?: string;/);
  assert.match(source, /updatedAt: linkedNote\?\.updatedAt \|\| null,/);
  assert.match(source, /createdAt: linkedNote\?\.createdAt \|\| linkedNote\?\.updatedAt \|\| null,/);
  assert.match(source, /const compareKnowledgeTreeItems = \(/);
  assert.match(source, /case 'updated-desc':/);
  assert.match(source, /case 'updated-asc':/);
  assert.match(source, /case 'created-desc':/);
  assert.match(source, /case 'created-asc':/);
  assert.match(source, /return compareTimestamps\(rightValue, leftValue\) \|\| compareTreeNames\(left\.name, right\.name\);/);
});
