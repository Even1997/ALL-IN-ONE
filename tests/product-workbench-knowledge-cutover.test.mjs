import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const readProductWorkbenchSource = () =>
  readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

test('product workbench source wires KnowledgeNoteWorkspace without retrieval-mode props', async () => {
  const source = await readProductWorkbenchSource();
  const workspaceInvocation = source.match(/<KnowledgeNoteWorkspace[\s\S]*?\/>/)?.[0] ?? '';

  assert.ok(workspaceInvocation.length > 0);
  assert.doesNotMatch(workspaceInvocation, /knowledgeRetrievalMethod=\{/);
  assert.doesNotMatch(workspaceInvocation, /onKnowledgeRetrievalMethodChange=\{/);
});

test('product workbench source drops retrieval-mode switching and legacy refresh cleanup', async () => {
  const source = await readProductWorkbenchSource();

  assert.doesNotMatch(source, /ensureProjectSystemIndex/);
  assert.doesNotMatch(source, /removeVaultKnowledgeOutputsExcept/);
  assert.doesNotMatch(source, /\u68c0\u7d22\u65b9\u5f0f/);
});

test('product workbench source does not reference legacy visible output lanes', async () => {
  const source = await readProductWorkbenchSource();

  assert.doesNotMatch(source, /_goodnight[\\/]+outputs[\\/]+llmwiki/);
  assert.doesNotMatch(source, /_goodnight[\\/]+outputs[\\/]+rag/);
});
