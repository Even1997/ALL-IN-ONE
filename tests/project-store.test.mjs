import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const sliceMethodBlock = (source, methodName, nextMethodName) => {
  const start = source.indexOf(`${methodName}: (input) => {`);
  const end = source.indexOf(`${nextMethodName}:`, start);

  assert.notEqual(start, -1, `${methodName} block should exist`);
  assert.notEqual(end, -1, `${nextMethodName} block should exist after ${methodName}`);

  return source.slice(start, end);
};

test('createProject no longer seeds starter markdown files into the knowledge list', async () => {
  const source = await readFile(new URL('../src/store/projectStore.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /title:\s*`\$\{projectName\}\s*初始需求\.md`/);
  assert.doesNotMatch(source, /title:\s*'信息架构草案\.md'/);
  assert.doesNotMatch(source, /const requirementDocs = buildStarterRequirementDocs\(project\.name,\s*project\.description\)/);
});

test('app create-project flow initializes the real project filesystem', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

  assert.match(source, /ensureProjectFilesystemStructure/);
  assert.match(source, /void ensureProjectFilesystemStructure\(project\.id\)/);
});

test('app design workspace loads and creates sketch pages through project files', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

  assert.match(source, /loadSketchPageArtifactsFromProjectDir/);
  assert.match(source, /replacePageStructure\(sketchArtifacts\.pageStructure,\s*featureTree\)/);
  assert.match(source, /replaceWireframes\(sketchArtifacts\.wireframes,\s*featureTree\)/);
  assert.match(source, /await writeSketchPageFile\(currentProject\.id,\s*nextPage,\s*null\)/);
});

test('app design workspace falls back to store page creation when Tauri runtime is unavailable', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

  assert.match(source, /isTauriRuntimeAvailable/);
  assert.match(source, /if \(!canUseProjectFilesystem\) \{\s*const nextPage = addRootPage\(\);/s);
});

test('project store keeps knowledge focus empty instead of restoring the first doc implicitly', async () => {
  const source = await readFile(new URL('../src/store/projectStore.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /activeKnowledgeFileId:\s*snapshot\.activeKnowledgeFileId\s*\|\|\s*snapshot\.requirementDocs\[0\]\?\.id\s*\|\|\s*null/);
  assert.doesNotMatch(source, /typeof persisted\.activeKnowledgeFileId === 'string'[\s\S]*:\s*requirementDocs\[0\]\?\.id \|\| null/);
});

test('project store no longer keeps multi-select knowledge context state', async () => {
  const source = await readFile(new URL('../src/store/projectStore.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /selectedKnowledgeContextIds:/);
  assert.doesNotMatch(source, /setSelectedKnowledgeContextIds:/);
  assert.doesNotMatch(source, /toggleKnowledgeContextId:/);
});

test('app project snapshots no longer persist selected knowledge context ids', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /selectedKnowledgeContextIds,/);
});

test('createProject starts from an empty workspace instead of auto-generating planning and delivery artifacts', async () => {
  const source = await readFile(new URL('../src/store/projectStore.ts', import.meta.url), 'utf8');
  const createProjectBlock = sliceMethodBlock(source, 'createProject', 'loadProjectWorkspace');

  assert.doesNotMatch(createProjectBlock, /const planningArtifacts = buildPlanningFiles\(/);
  assert.doesNotMatch(createProjectBlock, /const deliveryArtifacts = buildDeliveryArtifacts\(/);
  assert.match(createProjectBlock, /const rawRequirementInput = '';/);
  assert.match(createProjectBlock, /const prd = null;/);
  assert.match(createProjectBlock, /generatedFiles:\s*\[\],/);
  assert.match(createProjectBlock, /testPlan:\s*null,/);
  assert.match(createProjectBlock, /deployPlan:\s*null,/);
});
