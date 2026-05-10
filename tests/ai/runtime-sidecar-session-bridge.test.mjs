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

test('runtime sidecar session bridge preserves assistant timelines from snapshots', async () => {
  const source = await readFile(bridgePath, 'utf8');

  assert.match(source, /message\.role === 'assistant'/);
  assert.match(source, /messageTimeline/);
  assert.match(source, /timeline:\s*messageTimeline/);
});
