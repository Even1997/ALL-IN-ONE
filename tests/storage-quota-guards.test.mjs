import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../src/App.tsx');
const globalAIStorePath = path.resolve(__dirname, '../src/modules/ai/store/globalAIStore.ts');
const projectStorePath = path.resolve(__dirname, '../src/store/projectStore.ts');

test('global ai store does not persist heavyweight response history payloads', async () => {
  const source = await readFile(globalAIStorePath, 'utf8');

  assert.match(source, /type PersistedGlobalAIState = Pick</);
  assert.match(source, /partialize:\s*\(state\)\s*=>\s*buildPersistedGlobalAIState\(state\)/);
  assert.doesNotMatch(source, /requestHistory:\s*state\.requestHistory/);
  assert.doesNotMatch(source, /codeBlocks:\s*state\.codeBlocks/);
  assert.doesNotMatch(source, /suggestions:\s*state\.suggestions/);
});

test('project store does not persist full workspace snapshots into localStorage', async () => {
  const source = await readFile(projectStorePath, 'utf8');

  assert.match(source, /type PersistedProjectState = Pick<ProjectState, 'projects' \| 'currentProjectId'>/);
  assert.match(source, /partialize:\s*\(state\)\s*=>\s*buildPersistedProjectState\(state\)/);
  assert.doesNotMatch(source, /currentProject:\s*state\.currentProject/);
  assert.doesNotMatch(source, /rawRequirementInput:\s*state\.rawRequirementInput/);
  assert.doesNotMatch(source, /graph:\s*state\.graph/);
});

test('project index and snapshot localStorage writes are quota-guarded', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(
    source,
    /const safeLocalStorageSetItem = \(key: string, value: string\) => \{[\s\S]*?try \{[\s\S]*?window\.localStorage\.setItem\(key, value\);[\s\S]*?\} catch \{/,
  );
  assert.match(
    source,
    /const writeProjectIndex = \(projects: ProjectConfig\[\]\) => \{[\s\S]*?safeLocalStorageSetItem\(PROJECT_INDEX_STORAGE_KEY, JSON\.stringify\(projects\)\);/,
  );
  assert.match(
    source,
    /const writeProjectSnapshot = \(projectId: string, snapshot: PersistedProjectSnapshot\) => \{[\s\S]*?safeLocalStorageSetItem\(getProjectSnapshotStorageKey\(projectId\), JSON\.stringify\(snapshot\)\);/,
  );
});
