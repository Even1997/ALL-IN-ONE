import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

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
