import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const bridgePath = path.join(
  repoRoot,
  'src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts',
);

test('runtime sidecar session bridge maps snapshots into the desktop chat store', async () => {
  const source = await readFile(bridgePath, 'utf8');

  assert.match(source, /subscribeDesktopRuntimeEvents/);
  assert.match(source, /RuntimeSessionSnapshot/);
  assert.match(source, /useAIChatStore/);
  assert.match(source, /replaceSessionMessages/);
  assert.match(source, /upsertSession/);
});
