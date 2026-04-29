import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productPath = path.resolve(__dirname, '../src/components/product/ProductWorkbench.tsx');
const knowledgeWorkspacePath = path.resolve(__dirname, '../src/components/product/KnowledgeWorkspace.tsx');
const noteWorkspacePath = path.resolve(__dirname, '../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx');
const appCssPath = path.resolve(__dirname, '../src/App.css');

test('product workbench delegates knowledge notes and page workspace responsibilities to focused workspaces', async () => {
  const source = await readFile(productPath, 'utf8');

  assert.match(source, /import\s+\{\s*KnowledgeNoteWorkspace/);
  assert.match(source, /import\s+\{\s*PageWorkspace\s*\}\s+from '\.\/PageWorkspace'/);
  assert.match(source, /<KnowledgeNoteWorkspace/);
  assert.match(source, /<PageWorkspace/);
});

test('knowledge note workspace owns the compact note workbench layout and chrome classes', async () => {
  const source = await readFile(noteWorkspacePath, 'utf8');
  const css = await readFile(appCssPath, 'utf8');

  assert.match(source, /type KnowledgeNoteWorkspaceProps =/);
  assert.match(source, /notes: KnowledgeNote\[\]/);
  assert.match(source, /filteredNotes: KnowledgeNote\[\]/);
  assert.match(source, /gn-note-workspace/);
  assert.match(source, /gn-note-rail/);
  assert.match(source, /gn-note-editor-column/);
  assert.match(css, /\.gn-note-workspace\s*\{/);
  assert.match(css, /\.gn-note-rail,/);
  assert.match(css, /\.gn-note-editor-column,/);
});

test('knowledge workspace owns toolbar and content slots without a duplicate search field', async () => {
  const source = await readFile(knowledgeWorkspacePath, 'utf8');

  assert.match(source, /type KnowledgeWorkspaceProps =/);
  assert.match(source, /tabs\?: ReactNode/);
  assert.match(source, /content: ReactNode/);
  assert.match(source, /toolbarActions\?: ReactNode/);
  assert.match(source, /pm-knowledge-workspace-toolbar/);
  assert.match(source, /pm-knowledge-workspace-tabs/);
  assert.match(source, /pm-knowledge-workspace-content/);
  assert.doesNotMatch(source, /pm-knowledge-workspace-search/);
  assert.doesNotMatch(source, /type="search"/);
});

test('knowledge note workspace keeps the markdown editor while adding a dedicated reading view', async () => {
  const noteSource = await readFile(noteWorkspacePath, 'utf8');
  const css = await readFile(appCssPath, 'utf8');

  assert.match(noteSource, /GoodNightMarkdownEditor/);
  assert.match(noteSource, /KnowledgeMarkdownViewer/);
  assert.match(noteSource, /type KnowledgeViewMode = 'read' \| 'code'/);
  assert.match(noteSource, /阅读/);
  assert.match(noteSource, /代码/);
  assert.doesNotMatch(noteSource, /AtomicMarkdownEditor/);
  assert.match(noteSource, /value=\{editorValue\}/);
  assert.match(noteSource, /onChange=\{onEditorChange\}/);
  assert.doesNotMatch(noteSource, /requirement-markdown-preview/);
  assert.match(css, /\.gn-note-mode-toggle/);
  assert.match(css, /\.gn-note-reading-surface/);
  assert.match(css, /\.gn-markdown-viewer/);
});
