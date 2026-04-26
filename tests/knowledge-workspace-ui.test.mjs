import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productPath = path.resolve(__dirname, '../src/components/product/ProductWorkbench.tsx');
const shellPath = path.resolve(__dirname, '../src/components/product/WorkbenchShell.tsx');
const knowledgeWorkspacePath = path.resolve(__dirname, '../src/components/product/KnowledgeWorkspace.tsx');
const editorPath = path.resolve(__dirname, '../src/components/product/MilkdownEditor.tsx');
const appCssPath = path.resolve(__dirname, '../src/App.css');

test('product workbench delegates shell and workspace responsibilities to focused child components', async () => {
  const source = await readFile(productPath, 'utf8');

  assert.match(source, /import\s+\{\s*WorkbenchShell\s*\}\s+from '\.\/WorkbenchShell'/);
  assert.match(source, /import\s+\{\s*KnowledgeWorkspace\s*\}\s+from '\.\/KnowledgeWorkspace'/);
  assert.match(source, /import\s+\{\s*PageWorkspace\s*\}\s+from '\.\/PageWorkspace'/);
  assert.match(source, /<WorkbenchShell/);
  assert.match(source, /<KnowledgeWorkspace/);
  assert.match(source, /<PageWorkspace/);
});

test('workbench shell owns left center right layout and chrome classes', async () => {
  const source = await readFile(shellPath, 'utf8');
  const css = await readFile(appCssPath, 'utf8');

  assert.match(source, /type WorkbenchShellProps =/);
  assert.match(source, /leftPane: ReactNode/);
  assert.match(source, /centerPane: ReactNode/);
  assert.match(source, /rightPane: ReactNode/);
  assert.match(source, /<Allotment/);
  assert.match(css, /\.pm-workbench-shell\s*\{/);
  assert.match(css, /\.pm-workbench-sidebar\s*\{/);
  assert.match(css, /\.pm-workbench-main\s*\{/);
  assert.match(css, /\.pm-workbench-ai-pane\s*\{/);
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

test('knowledge workspace uses Milkdown editor instead of textarea-only reading view', async () => {
  const editorSource = await readFile(editorPath, 'utf8');
  const productSource = await readFile(productPath, 'utf8');

  assert.match(editorSource, /@milkdown\/react/);
  assert.match(editorSource, /MilkdownProvider/);
  assert.match(editorSource, /defaultValueCtx/);
  assert.match(editorSource, /onChange/);
  assert.match(productSource, /<MilkdownEditor/);
  assert.doesNotMatch(productSource, /requirement-markdown-preview/);
});
