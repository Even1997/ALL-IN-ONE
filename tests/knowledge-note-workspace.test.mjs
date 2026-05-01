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

test('knowledge note workspace keeps manual m-flow refresh without retrieval switching or wiki graph UI', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /onOrganizeKnowledge: \(\) => void/);
  assert.match(source, /activeFilter: KnowledgeNoteFilter/);
  assert.match(source, /onFilterChange: \(filter: KnowledgeNoteFilter\) => void/);
  assert.doesNotMatch(source, /knowledgeRetrievalMethod/);
  assert.doesNotMatch(source, /onKnowledgeRetrievalMethodChange/);
  assert.match(source, /刷新/);
  assert.doesNotMatch(source, /KnowledgeGraphCanvas/);
  assert.doesNotMatch(source, /onOpenGlobalWikiGraph/);
});

test('knowledge note tree stays navigation-only without content previews', async () => {
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

test('knowledge note workspace keeps editor metadata basics without reference-heavy detail panes', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /referenceTitles/);
  assert.doesNotMatch(source, /selectedNote\.referenceTitles/);
  assert.match(source, /mirrorSourcePath/);
});

test('knowledge note workspace defaults to reading mode and exposes a code toggle for markdown editing', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /type KnowledgeViewMode = 'read' \| 'code'/);
  assert.match(source, /useState<KnowledgeViewMode>\('read'\)/);
  assert.match(source, /setViewMode\('read'\)/);
  assert.match(source, /KnowledgeMarkdownViewer/);
  assert.match(source, /GoodNightMarkdownEditor/);
  assert.match(source, /serializeKnowledgeNoteMarkdown/);
});

test('knowledge note workspace previews unmapped markdown files inside the app instead of opening them as attachments', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /type RawMarkdownPreview =/);
  assert.match(source, /const isPreviewableKnowledgeFile = \(extension: string\)/);
  assert.match(source, /else if \(isPreviewableKnowledgeFile\(file\.extension\)\) {\s*void handleOpenRawMarkdownPreview\(file\);\s*} else {\s*onOpenAttachment\(file\.absolutePath\);\s*}/s);
  assert.match(source, /rawMarkdownPreview \? \(/);
  assert.match(source, /Markdown 预览/);
});
