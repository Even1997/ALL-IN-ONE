import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('project config defines vault path and retrieval method with m-flow defaults', async () => {
  const typesSource = await readFile(new URL('../src/types/index.ts', import.meta.url), 'utf8');
  const storeSource = await readFile(new URL('../src/store/projectStore.ts', import.meta.url), 'utf8');

  assert.match(typesSource, /export type KnowledgeRetrievalMethod =/);
  assert.match(typesSource, /'m-flow'/);
  assert.match(typesSource, /'llmwiki'/);
  assert.match(typesSource, /'rag'/);
  assert.match(typesSource, /vaultPath: string/);
  assert.match(typesSource, /knowledgeRetrievalMethod: KnowledgeRetrievalMethod/);

  assert.match(storeSource, /export interface CreateProjectInput\s*\{[\s\S]*vaultPath: string;[\s\S]*knowledgeRetrievalMethod: KnowledgeRetrievalMethod;[\s\S]*\}/);
  assert.match(storeSource, /vaultPath:\s*typeof project\.vaultPath === 'string'/);
  assert.match(storeSource, /knowledgeRetrievalMethod:\s*project\.knowledgeRetrievalMethod === 'llmwiki' \|\| project\.knowledgeRetrievalMethod === 'rag'/);
  assert.match(storeSource, /: 'm-flow'/);
  assert.match(storeSource, /vaultPath:\s*input\.vaultPath\.trim\(\)/);
  assert.match(storeSource, /knowledgeRetrievalMethod:\s*normalizeKnowledgeRetrievalMethod\(input\.knowledgeRetrievalMethod\)/);
});

test('project persistence exposes vault helpers and hidden knowledge directory structure', async () => {
  const source = await readFile(new URL('../src/utils/projectPersistence.ts', import.meta.url), 'utf8');

  assert.match(source, /export const getProjectKnowledgeRootDir =/);
  assert.match(source, /sanitizeProjectPathSegment\(project\.name \|\| project\.id\)/);
  assert.match(source, /export const getVaultStateDir =/);
  assert.match(source, /export const getVaultOutputsDir =/);
  assert.match(source, /export const ensureVaultKnowledgeDirectoryStructure = async/);
  assert.match(source, /joinPath\(vaultPath,\s*'\.goodnight'\)/);
  assert.match(source, /joinPath\(vaultPath,\s*'_goodnight',\s*'outputs'\)/);
  assert.match(source, /'llmwiki'/);
  assert.match(source, /'rag'/);
  assert.match(source, /'m-flow'/);
  assert.match(source, /'base-index'/);
});

test('project setup collects a local vault path and retrieval method', async () => {
  const source = await readFile(new URL('../src/components/project/ProjectSetup.tsx', import.meta.url), 'utf8');

  assert.match(source, /vaultPath/);
  assert.match(source, /knowledgeRetrievalMethod/);
  assert.match(source, /onPickProjectVaultPath/);
  assert.match(source, /本地知识库文件夹/);
  assert.match(source, /检索方式/);
  assert.match(source, /m-flow/);
});

test('app wires vault picking and ensures the vault knowledge directory structure on create', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

  assert.match(source, /ensureProjectKnowledgeDirectory/);
  assert.match(source, /const handlePickProjectVaultPath = useCallback/);
  assert.match(source, /directory: true/);
  assert.match(source, /onPickProjectVaultPath=\{handlePickProjectVaultPath\}/);
  assert.match(source, /void ensureProjectKnowledgeDirectory\(project\)/);
});

test('knowledge note workspace renders retrieval method controls above the tree', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /knowledgeRetrievalMethod:/);
  assert.match(source, /onKnowledgeRetrievalMethodChange:/);
  assert.match(source, /检索方式/);
  assert.match(source, /m-flow/);
});

test('product workbench uses the current project knowledge directory as knowledge root and passes retrieval controls through', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  assert.match(source, /getProjectKnowledgeRootDir/);
  assert.match(source, /const projectKnowledgeRootDir = useMemo/);
  assert.match(source, /setProjectRootDir\(projectKnowledgeRootDir\)/);
  assert.match(source, /knowledgeRetrievalMethod=\{currentProject\.knowledgeRetrievalMethod\}/);
  assert.match(source, /onKnowledgeRetrievalMethodChange=/);
});

test('system index refresh accepts the project knowledge directory and keeps index artifacts in the project state dir', async () => {
  const source = await readFile(new URL('../src/modules/knowledge/systemIndexProject.ts', import.meta.url), 'utf8');

  assert.match(source, /vaultPath: string/);
  assert.match(source, /knowledgeRetrievalMethod:/);
  assert.match(source, /getVaultBaseIndexDir/);
  assert.match(
    source,
    /collectProjectFileSources\(\s*options\.vaultPath,\s*options\.vaultPath,\s*options\.knowledgeRetrievalMethod\s*\)/
  );
  assert.match(source, /normalized === '\.goodnight' \|\| normalized\.startsWith\('\.goodnight\/'\)/);
  assert.match(source, /normalized === '_goodnight' \|\| normalized\.startsWith\('_goodnight\/'\)/);
  assert.match(source, /options\.knowledgeRetrievalMethod/);
});

test('product workbench and ai chat pass the active retrieval method into system indexing', async () => {
  const workbenchSource = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');
  const chatSource = await readFile(new URL('../src/components/workspace/AIChat.tsx', import.meta.url), 'utf8');

  assert.match(workbenchSource, /const projectKnowledgeRootDir = useMemo/);
  assert.match(chatSource, /const projectKnowledgeRootDir = useMemo/);
  assert.match(workbenchSource, /knowledgeRetrievalMethod: currentProject\.knowledgeRetrievalMethod/);
  assert.match(chatSource, /knowledgeRetrievalMethod: currentProject\.knowledgeRetrievalMethod/);
  assert.match(workbenchSource, /vaultPath: projectRootDir/);
  assert.match(chatSource, /vaultPath: projectKnowledgeRootDir/);
});
