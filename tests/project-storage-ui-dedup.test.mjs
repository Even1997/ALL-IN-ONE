import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('project setup keeps a single project storage path entry without a duplicate storage panel', async () => {
  const source = await readFile(new URL('../src/components/project/ProjectSetup.tsx', import.meta.url), 'utf8');

  assert.match(source, /project-storage-inline/);
  assert.match(source, /defaultProjectStoragePath/);
  assert.doesNotMatch(source, /value=\{projectStorageDraft\}/);
  assert.doesNotMatch(source, /setProjectStorageDraft/);
  assert.doesNotMatch(source, /aria-label="项目存储位置"/);
});
