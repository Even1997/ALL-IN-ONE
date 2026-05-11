import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeEntryPath = path.resolve(__dirname, '../../apps/runtime/src/index.ts');

test('runtime sidecar broadcasts streaming draft deltas without awaiting disk persistence', async () => {
  const source = await readFile(runtimeEntryPath, 'utf8');

  assert.match(source, /persistAssistantMessage\s*=\s*async\s*\(\s*final\s*=\s*false,\s*options/);
  assert.match(source, /if\s*\(\s*options\?\.persist\s*!==\s*false\s*\)\s*\{[\s\S]*?await saveState\(config, state\);[\s\S]*?\}/);
  assert.match(source, /await persistAssistantMessage\(false,\s*\{\s*persist:\s*false\s*\}\);/);
});

test('runtime sidecar coalesces expensive streaming draft timeline updates', async () => {
  const source = await readFile(runtimeEntryPath, 'utf8');

  assert.match(source, /createRuntimeStreamingDraftScheduler/);
  assert.match(source, /streamingAssembler\.appendChunk\(event\);[\s\S]*?draftSyncScheduler\.push\(event\.kind === 'thinking'\);/);
  assert.match(source, /await draftSyncScheduler\.flush\(\);[\s\S]*?streamingAssembler\.buildFinal\(finalContent\);/);
});

test('runtime sidecar emits streaming latency trace data with turn deltas', async () => {
  const source = await readFile(runtimeEntryPath, 'utf8');

  assert.match(source, /buildTurnDeltaEvent\s*=\s*\(\s*sessionId:\s*string,\s*messageId:\s*string,\s*delta:\s*string,\s*trace:/);
  assert.match(source, /payload:\s*\{[\s\S]*trace,/);
  assert.match(source, /providerFirstChunkAt/);
  assert.match(source, /providerChunkAt/);
  assert.match(source, /chunkIndex/);
});
