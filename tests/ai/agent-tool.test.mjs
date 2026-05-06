import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRuntimeAgentToolResult,
  resolveRuntimeAgentToolInput,
} from '../../src/modules/ai/runtime/tools/agentTool.ts';

test('agent tool input resolver accepts prompt aliases and preferred agent hints', () => {
  assert.deepEqual(
    resolveRuntimeAgentToolInput({
      prompt: 'Inspect the runtime flow and propose a fix.',
      agent: 'claude',
    }),
    {
      prompt: 'Inspect the runtime flow and propose a fix.',
      preferredAgent: 'claude',
    },
  );

  assert.deepEqual(
    resolveRuntimeAgentToolInput({
      task: 'Summarize the implementation strategy.',
      preferred_agent: 'codex',
    }),
    {
      prompt: 'Summarize the implementation strategy.',
      preferredAgent: 'codex',
    },
  );
});

test('agent tool input resolver rejects missing prompts and unsupported agent ids', () => {
  assert.equal(resolveRuntimeAgentToolInput({}), null);
  assert.equal(
    resolveRuntimeAgentToolInput({
      prompt: 'Inspect the repo.',
      agent: 'team',
    }),
    null,
  );
});

test('agent tool result formatter summarizes final content and changed paths', () => {
  const result = buildRuntimeAgentToolResult({
    finalContent: 'Integrated result.',
    changedPaths: ['src/app.ts', 'tests/app.test.mjs'],
  });

  assert.equal(result.type, 'text');
  assert.equal(result.is_error, undefined);
  assert.match(result.content, /Integrated result\./);
  assert.match(result.content, /src\/app\.ts/);
  assert.match(result.content, /tests\/app\.test\.mjs/);
});
