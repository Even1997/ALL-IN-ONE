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
  assert.match(workspaceInvocation, /projectRootPath=\{projectRootDir\}/);
  assert.doesNotMatch(workspaceInvocation, /activeFilter=\{/);
  assert.doesNotMatch(workspaceInvocation, /isSyncing=\{/);
  assert.doesNotMatch(workspaceInvocation, /onOrganizeKnowledge=\{/);
  assert.doesNotMatch(workspaceInvocation, /onFilterChange=\{/);
});

test('product workbench source uses vault-root helpers and drops graph runtime wiring', async () => {
  const source = await readProductWorkbenchSource();

  assert.match(source, /ensureProjectVaultDirectory/);
  assert.match(source, /getProjectVaultRootDir/);
  assert.match(source, /const vaultRootDir = useMemo/);
  assert.doesNotMatch(source, /ensureProjectKnowledgeDirectory/);
  assert.doesNotMatch(source, /getProjectKnowledgeRootDir/);
  assert.doesNotMatch(source, /rebuildProjectMFlow/);
  assert.doesNotMatch(source, /formatMFlowRefreshSummary/);
  assert.doesNotMatch(source, /KnowledgeGraphWorkspace/);
  assert.doesNotMatch(source, /ensureProjectSystemIndex/);
  assert.doesNotMatch(source, /removeVaultKnowledgeOutputsExcept/);
  assert.doesNotMatch(source, /\u68c0\u7d22\u65b9\u5f0f/);
});

test('product workbench source does not reference legacy visible output lanes', async () => {
  const source = await readProductWorkbenchSource();

  assert.doesNotMatch(source, /_goodnight[\\/]+outputs[\\/]+llmwiki/);
  assert.doesNotMatch(source, /_goodnight[\\/]+outputs[\\/]+rag/);
});

test('product workbench source search-filters notes without knowledge-type filter state', async () => {
  const source = await readProductWorkbenchSource();

  assert.match(source, /const filteredServerNotes = useMemo/);
  assert.match(source, /filterKnowledgeNotes\(serverNotes, normalizedSearch\)/);
  assert.doesNotMatch(source, /KnowledgeNoteFilter/);
  assert.doesNotMatch(source, /knowledgeFilter/);
  assert.doesNotMatch(source, /filterKnowledgeNotesByType/);
  assert.doesNotMatch(source, /handleOrganizeKnowledge/);
});
