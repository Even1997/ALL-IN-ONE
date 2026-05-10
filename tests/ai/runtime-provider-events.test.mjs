import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('node runtime provider client imports shared runtime provider event types', async () => {
  const source = await readFile('apps/runtime/src/nodeRuntimeProviderClient.ts', 'utf8');

  assert.match(
    source,
    /from '\.\.\/\.\.\/\.\.\/src\/modules\/ai\/runtime\/provider\/runtimeProviderEvents\.ts'/,
  );
  assert.doesNotMatch(source, /type RuntimeProviderStreamEvent =/);
});

test('openai-compatible streaming path parses native tool call deltas before XML fallback', async () => {
  const source = await readFile('apps/runtime/src/nodeRuntimeProviderClient.ts', 'utf8');

  assert.match(source, /tool_calls/);
  assert.match(source, /parseOpenAICompatibleToolCall/);
});
