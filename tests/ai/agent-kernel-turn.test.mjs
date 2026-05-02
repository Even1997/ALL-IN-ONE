import assert from 'node:assert/strict';
import test from 'node:test';

import { runAgentTurn } from '../../src/modules/ai/runtime/agent-kernel/runAgentTurn.ts';

const toolUse = (name, input) => `<tool_use>
<tool name="${name}">
<tool_params>${JSON.stringify(input)}</tool_params>
</tool>
</tool_use>`;

const createInput = (overrides = {}) => ({
  projectId: 'project-1',
  projectName: 'GoodNight',
  threadId: 'thread-1',
  userInput: 'Inspect the app file.',
  contextWindowTokens: 32000,
  conversationHistory: [],
  instructions: ['Keep edits surgical.'],
  referenceFiles: [],
  memoryEntries: [],
  activeSkills: [],
  executeModel: async () => 'The app file is ready.',
  executeTool: async () => ({
    type: 'text',
    content: 'unused',
  }),
  ...overrides,
});

test('agent turn runner returns normal final model text with context', async () => {
  const finalText = 'The app file is ready.';
  let modelPrompt = '';

  const result = await runAgentTurn(
    createInput({
      executeModel: async (prompt) => {
        modelPrompt = prompt;
        return finalText;
      },
    }),
  );

  assert.equal(result.finalContent, finalText);
  assert.equal(result.context.threadId, 'thread-1');
  assert.deepEqual(result.toolCalls, []);
  assert.match(modelPrompt, /<context_report>/);
  assert.match(modelPrompt, /Inspect the app file\./);
  assert.match(modelPrompt, /Keep edits surgical\./);
});

test('agent turn runner executes a tool call before returning final text', async () => {
  const firstToolUse = toolUse('view', { file_path: 'src/app.ts', limit: 20 });
  const modelResponses = [
    firstToolUse,
    'The file contains the app entry point.',
  ];
  const modelPrompts = [];
  const executedCalls = [];

  const result = await runAgentTurn(
    createInput({
      executeModel: async (prompt) => {
        modelPrompts.push(prompt);
        return modelResponses.shift();
      },
      executeTool: async (call) => {
        executedCalls.push(call);
        return {
          type: 'text',
          content: '1: console.log("app");',
        };
      },
    }),
  );

  assert.equal(executedCalls.length, 1);
  assert.equal(result.finalContent, 'The file contains the app entry point.');
  assert.equal(result.toolCalls[0].name, 'view');
  assert.equal(modelPrompts.length, 2);
  assert.match(modelPrompts[1], /<tool_use>/);
  assert.match(modelPrompts[1], /<tool name="view">/);
  assert.ok(modelPrompts[1].includes('<tool_params>{"file_path":"src/app.ts","limit":20}</tool_params>'));
  assert.match(modelPrompts[1], /Tool view result/);
  assert.match(modelPrompts[1], /<tool_result name="text" success>/);
  assert.match(modelPrompts[1], /console\.log\("app"\)/);
  assert.match(modelPrompts[1], /<\/tool_result>/);
});

test('agent turn runner honors a caller-provided tool allowlist', async () => {
  const modelResponses = [
    toolUse('write', { file_path: 'src/app.ts', content: 'changed' }),
    'I cannot write through the read-only kernel.',
  ];
  let executed = false;

  const result = await runAgentTurn(
    createInput({
      allowedTools: ['view'],
      executeModel: async () => modelResponses.shift(),
      executeTool: async () => {
        executed = true;
        return {
          type: 'text',
          content: 'should not run',
        };
      },
    }),
  );

  assert.equal(executed, false);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, 'write');
  assert.equal(result.toolCalls[0].status, 'blocked');
});
