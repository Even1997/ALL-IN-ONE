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

test('product workbench delegates note graph and page responsibilities to focused workspaces', async () => {
  const source = await readFile(productPath, 'utf8');

  assert.match(source, /import\s+\{\s*KnowledgeNoteWorkspace/);
  assert.match(source, /import\s+\{\s*KnowledgeGraphWorkspace\s*\}/);
  assert.match(source, /import\s+\{\s*PageWorkspace\s*\}\s+from '\.\/PageWorkspace'/);
  assert.match(source, /<KnowledgeNoteWorkspace/);
  assert.match(source, /<KnowledgeGraphWorkspace/);
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
  assert.match(source, /gn-note-side/);
  assert.match(css, /\.gn-note-workspace\s*\{/);
  assert.match(css, /\.gn-note-rail,/);
  assert.match(css, /\.gn-note-editor-column,/);
  assert.match(css, /\.gn-note-side\s*\{/);
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

test('knowledge note workspace uses the GoodNight markdown editor instead of textarea-only reading view', async () => {
  const noteSource = await readFile(noteWorkspacePath, 'utf8');

  assert.match(noteSource, /GoodNightMarkdownEditor/);
  assert.doesNotMatch(noteSource, /AtomicMarkdownEditor/);
  assert.match(noteSource, /value=\{editorValue\}/);
  assert.match(noteSource, /onChange=\{onEditorChange\}/);
  assert.doesNotMatch(noteSource, /requirement-markdown-preview/);
});
