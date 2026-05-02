import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const memoryRuntimePath = path.resolve(__dirname, '../../src/modules/ai/runtime/memory/projectMemoryRuntime.ts');
const typesPath = path.resolve(__dirname, '../../src/types/index.ts');
const projectStorePath = path.resolve(__dirname, '../../src/store/projectStore.ts');

const loadMemoryRuntime = async () =>
  import(`../../src/modules/ai/runtime/memory/projectMemoryRuntime.ts?test=${Date.now()}`);

test('project memory runtime builds structured project memory entries', async () => {
  const { buildProjectMemoryEntry } = await loadMemoryRuntime();
  const entry = buildProjectMemoryEntry({
    id: 'memory-1',
    title: 'UI baseline',
    summary: 'Keep the current frontend shell',
    content: 'Only extend the existing UI instead of replacing it.',
    kind: 'projectFact',
    updatedAt: 10,
  });

  assert.equal(entry.id, 'memory-1');
  assert.equal(entry.label, 'projectFact');
  assert.match(entry.content, /existing UI/i);
});

test('project memory schema and store persist structured memory entries', async () => {
  const typesSource = await readFile(typesPath, 'utf8');
  const projectStoreSource = await readFile(projectStorePath, 'utf8');

  assert.match(typesSource, /memoryEntries:/);
  assert.match(projectStoreSource, /memoryEntries:/);
  assert.match(projectStoreSource, /projectFact/);
  assert.match(projectStoreSource, /userPreference/);
});
