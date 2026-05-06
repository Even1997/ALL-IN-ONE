import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const executionPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts'
);
const agentKernelPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/agent-kernel/runAgentTurn.ts'
);

test('project fact grounding is model-guided instead of regex retried by the runtime', async () => {
  const executionSource = await readFile(executionPath, 'utf8');
  const agentKernelSource = await readFile(agentKernelPath, 'utf8');

  assert.doesNotMatch(executionSource, /PROJECT_FACT_REQUEST_PATTERN/);
  assert.doesNotMatch(executionSource, /PROJECT_FACT_TARGET_PATTERN/);
  assert.doesNotMatch(executionSource, /looksLikeProjectFactRequest/);
  assert.doesNotMatch(executionSource, /This request asks for current-project facts/);
  assert.doesNotMatch(executionSource, /Your previous reply still did not inspect the project/);
  assert.match(
    agentKernelSource,
    /If the answer depends on current-project facts that are not already in context, inspect the project with read-only tools before answering\./
  );
});
