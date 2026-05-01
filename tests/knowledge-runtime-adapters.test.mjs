import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('native m-flow runtime source exposes rebuild and prompt-context entrypoints only', async () => {
  const runtimeSource = await readFile(new URL('../src/modules/knowledge/m-flow/runtime.ts', import.meta.url), 'utf8');

  assert.match(runtimeSource, /rebuildProjectMFlow/);
  assert.match(runtimeSource, /buildMFlowPromptContext/);
  assert.doesNotMatch(runtimeSource, /KnowledgeRetrievalMethod/);
  assert.doesNotMatch(runtimeSource, /knowledgeRetrievalMethod:/);
  assert.doesNotMatch(runtimeSource, /llmwiki/);
  assert.doesNotMatch(runtimeSource, /rag/);
});
