import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('project config source drops retrieval-mode variants from the product contract', async () => {
  const typesSource = await readFile(new URL('../src/types/index.ts', import.meta.url), 'utf8');
  const storeSource = await readFile(new URL('../src/store/projectStore.ts', import.meta.url), 'utf8');
  const projectConfigBlock = typesSource.match(/export interface ProjectConfig\s*{[\s\S]*?}/)?.[0] ?? '';
  const createProjectInputBlock = storeSource.match(/export interface CreateProjectInput\s*{[\s\S]*?}/)?.[0] ?? '';
  const createProjectLiteral = storeSource.match(/const project: ProjectConfig = \{[\s\S]*?\n\s*\};/)?.[0] ?? '';

  assert.doesNotMatch(typesSource, /KnowledgeRetrievalMethod/);
  assert.match(projectConfigBlock, /vaultPath: string/);
  assert.doesNotMatch(projectConfigBlock, /knowledgeRetrievalMethod:/);

  assert.match(createProjectInputBlock, /vaultPath:\s*string/);
  assert.doesNotMatch(createProjectInputBlock, /knowledgeRetrievalMethod:/);
  assert.match(storeSource, /knowledgeRetrievalMethod:\s*_legacyKnowledgeRetrievalMethod/);
  assert.doesNotMatch(createProjectLiteral, /knowledgeRetrievalMethod:/);
});

test('vault persistence source targets native m-flow state and outputs', async () => {
  const source = await readFile(new URL('../src/utils/projectPersistence.ts', import.meta.url), 'utf8');

  assert.match(source, /getVaultMFlowDir = \(vaultPath: string\) => joinPath\(getVaultStateDir\(vaultPath\), 'm-flow'\)/);
  assert.match(source, /getVaultMFlowOutputsDir = \(vaultPath: string\) => joinPath\(getVaultOutputsDir\(vaultPath\), 'm-flow'\)/);
  assert.doesNotMatch(source, /getVaultBaseIndexDir/);
  assert.doesNotMatch(source, /getVaultSkillStateDir/);
  assert.doesNotMatch(source, /getVaultSkillOutputsDir/);
  assert.doesNotMatch(source, /ensureVaultKnowledgeRuntimeDirectoryStructure/);
  assert.doesNotMatch(source, /\.goodnight[\\/]+base-index/);
  assert.doesNotMatch(source, /_goodnight[\\/]+outputs[\\/]+llmwiki/);
  assert.doesNotMatch(source, /_goodnight[\\/]+outputs[\\/]+rag/);
  assert.doesNotMatch(source, /\.goodnight[\\/]+skills/);
  assert.match(source, /getSystemIndexDir = \(projectDir: string\) => getVaultMFlowDir\(projectDir\)/);
});

test('knowledge workspace source removes retrieval-method controls and copy', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /knowledgeRetrievalMethod:/);
  assert.doesNotMatch(source, /onKnowledgeRetrievalMethodChange:/);
  assert.doesNotMatch(source, /\u68c0\u7d22\u65b9\u5f0f/);
});

test('product workbench source drops retrieval-mode fields and legacy refresh cleanup', async () => {
  const workbenchSource = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(workbenchSource, /knowledgeRetrievalMethod\s*[:=]/);
  assert.doesNotMatch(workbenchSource, /onKnowledgeRetrievalMethodChange\s*=/);
  assert.doesNotMatch(workbenchSource, /removeVaultKnowledgeOutputsExcept/);
  assert.doesNotMatch(workbenchSource, /ensureProjectSystemIndex/);
});
