import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('knowledge operation policy keeps AI read-only before approval', async () => {
  const promptSource = await readFile(new URL('../src/modules/ai/chat/directChatPrompt.ts', import.meta.url), 'utf8');
  const projectFileFlowSource = await readFile(
    new URL('../src/modules/ai/runtime/orchestration/runtimeProjectFileFlow.ts', import.meta.url),
    'utf8'
  );

  assert.match(promptSource, /Use read-only tools such as ls, view, glob, and grep/);
  assert.match(promptSource, /Ask for confirmation before irreversible, high-risk, external, or out-of-scope actions\./);
  assert.match(projectFileFlowSource, /executionMessage:\s*'请确认后执行。'/);
  assert.match(projectFileFlowSource, /decision:\s*'approval-required'/);
  assert.match(projectFileFlowSource, /summary:\s*`删除 \$\{pathSummary\}`/);
});
