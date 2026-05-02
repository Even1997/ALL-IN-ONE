import assert from 'node:assert/strict';
import test from 'node:test';

import { runRuntimeToolLoop } from '../../src/modules/ai/runtime/tools/runtimeToolLoop.ts';

const toolUse = (name, input) => `<tool_use>
<tool name="${name}">
<tool_params>${JSON.stringify(input)}</tool_params>
</tool>
</tool_use>`;

test('runtime tool loop executes an XML view tool call before returning final content', async () => {
  const modelResponses = [
    toolUse('view', { file_path: 'src/app.ts', limit: 20 }),
    'The file contains the app entry point.',
  ];
  const modelMessages = [];
  const executedCalls = [];

  const result = await runRuntimeToolLoop({
    maxRounds: 3,
    initialPrompt: 'Inspect the app file.',
    systemPrompt: 'Use tools when useful.',
    allowedTools: ['view'],
    callModel: async (messages) => {
      modelMessages.push(messages.map((message) => ({ ...message })));
      return modelResponses.shift();
    },
    executeTool: async (call) => {
      executedCalls.push(call);
      return {
        type: 'text',
        content: '1: console.log("app");',
      };
    },
  });

  assert.equal(result.finalContent, 'The file contains the app entry point.');
  assert.equal(executedCalls.length, 1);
  assert.equal(executedCalls[0].name, 'view');
  assert.deepEqual(executedCalls[0].input, { file_path: 'src/app.ts', limit: 20 });
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, 'view');
  assert.equal(result.toolCalls[0].status, 'completed');
  assert.equal(result.toolCalls[0].resultPreview, '1: console.log("app");');
  assert.equal(modelMessages.length, 2);
  assert.equal(modelMessages[1][2].role, 'user');
  assert.match(modelMessages[1][2].content, /console\.log/);
});

test('runtime tool loop returns an exhausted message instead of raw XML tool calls', async () => {
  const result = await runRuntimeToolLoop({
    maxRounds: 1,
    initialPrompt: 'Inspect the app file.',
    systemPrompt: 'Use tools when useful.',
    allowedTools: ['view'],
    callModel: async () => toolUse('view', { file_path: 'src/app.ts' }),
    executeTool: async () => ({
      type: 'text',
      content: '1: console.log("app");',
    }),
  });

  assert.doesNotMatch(result.finalContent, /<tool_use>/);
  assert.match(result.finalContent, /exhausted/i);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].status, 'completed');
});

test('runtime tool loop blocks disallowed tools and feeds the result as a user message', async () => {
  const modelMessages = [];

  const result = await runRuntimeToolLoop({
    maxRounds: 2,
    initialPrompt: 'Run a shell command.',
    systemPrompt: 'Use tools when useful.',
    allowedTools: ['view'],
    callModel: async (messages) => {
      modelMessages.push(messages.map((message) => ({ ...message })));
      return modelMessages.length === 1
        ? toolUse('bash', { command: 'echo hi' })
        : 'I cannot run that command.';
    },
    executeTool: async () => {
      throw new Error('executeTool should not be called for blocked tools');
    },
  });

  assert.equal(result.finalContent, 'I cannot run that command.');
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, 'bash');
  assert.equal(result.toolCalls[0].status, 'blocked');
  assert.equal(modelMessages.length, 2);
  assert.equal(modelMessages[1][2].role, 'user');
  assert.match(modelMessages[1][2].content, /not allowed/);
});

test('runtime tool loop emits tool call snapshots while calls run and settle', async () => {
  const snapshots = [];

  await runRuntimeToolLoop({
    maxRounds: 2,
    initialPrompt: 'Inspect the app file.',
    systemPrompt: 'Use tools when useful.',
    allowedTools: ['view'],
    callModel: async (messages) =>
      messages.length === 1
        ? toolUse('view', { file_path: 'src/app.ts' })
        : 'Done.',
    executeTool: async () => ({
      type: 'text',
      content: '1: console.log("app");',
    }),
    onToolCallsChange: (toolCalls) => {
      snapshots.push(toolCalls.map((call) => ({ ...call })));
    },
  });

  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0][0].status, 'running');
  assert.equal(snapshots[1][0].status, 'completed');
  assert.match(snapshots[1][0].resultPreview, /console\.log/);
});
