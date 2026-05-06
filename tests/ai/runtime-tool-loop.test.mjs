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

test('runtime tool loop preserves visible text across multiple tool rounds', async () => {
  const modelResponses = [
    `I will inspect the file first.\n${toolUse('view', { file_path: 'src/app.ts', limit: 20 })}`,
    `I found the issue and will patch it.\n${toolUse('edit', {
      file_path: 'src/app.ts',
      old_string: 'bad()',
      new_string: 'good()',
    })}`,
    'The patch is in place.',
  ];

  const result = await runRuntimeToolLoop({
    maxRounds: 4,
    initialPrompt: 'Fix the app file.',
    systemPrompt: 'Use tools when useful.',
    allowedTools: ['view', 'edit'],
    callModel: async () => modelResponses.shift(),
    executeTool: async (call) => ({
      type: 'text',
      content:
        call.name === 'view'
          ? '1: bad()'
          : 'File successfully edited: src/app.ts',
    }),
  });

  assert.equal(
    result.finalContent,
    'I will inspect the file first.\n\nI found the issue and will patch it.\n\nThe patch is in place.',
  );
});

test('runtime tool loop normalizes read tool aliases to view before allowlist checks', async () => {
  const executedCalls = [];

  const result = await runRuntimeToolLoop({
    maxRounds: 2,
    initialPrompt: 'Read the app file.',
    systemPrompt: 'Use tools when useful.',
    allowedTools: ['view'],
    callModel: async (messages) =>
      messages.length === 1
        ? toolUse('read', { path: 'src/app.ts', limit: 10 })
        : 'The file was read successfully.',
    executeTool: async (call) => {
      executedCalls.push(call);
      return {
        type: 'text',
        content: '1: console.log("app");',
      };
    },
  });

  assert.equal(result.finalContent, 'The file was read successfully.');
  assert.equal(executedCalls.length, 1);
  assert.equal(executedCalls[0].name, 'view');
  assert.deepEqual(executedCalls[0].input, { path: 'src/app.ts', limit: 10 });
  assert.equal(result.toolCalls[0].name, 'view');
  assert.equal(result.toolCalls[0].status, 'completed');
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

test('runtime tool loop keeps accumulated visible text when max rounds are exhausted', async () => {
  const modelResponses = [
    `I will inspect the app file first.\n${toolUse('view', { file_path: 'src/app.ts' })}`,
    toolUse('view', { file_path: 'src/app.ts', limit: 10 }),
  ];

  const result = await runRuntimeToolLoop({
    maxRounds: 2,
    initialPrompt: 'Inspect the app file.',
    systemPrompt: 'Use tools when useful.',
    allowedTools: ['view'],
    callModel: async () => modelResponses.shift(),
    executeTool: async () => ({
      type: 'text',
      content: '1: console.log("app");',
    }),
  });

  assert.doesNotMatch(result.finalContent, /<tool_use>/);
  assert.equal(result.finalContent, 'I will inspect the app file first.');
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

test('runtime tool loop emits unified agent events for tools and final text', async () => {
  const events = [];

  const result = await runRuntimeToolLoop({
    maxRounds: 2,
    initialPrompt: 'List files.',
    systemPrompt: 'Use tools when useful.',
    allowedTools: ['ls'],
    callModel: async (messages) =>
      messages.length === 1
        ? toolUse('ls', { path: '.' })
        : 'Done.\n<tool_use>\n</tool_use>\nuser:\nTool ls result:\ninternal',
    executeTool: async () => ({
      type: 'text',
      content: 'src\npackage.json',
    }),
    onAgentEvent: (event) => {
      events.push(event);
    },
  });

  assert.equal(result.finalContent, 'Done.');
  assert.deepEqual(
    events.map((event) => event.type),
    ['tool_call_started', 'tool_result', 'tool_call_completed', 'final_text'],
  );
  assert.equal(events[0].toolCall.name, 'ls');
  assert.equal(events[1].content, 'src\npackage.json');
  assert.equal(events[2].toolCall.status, 'completed');
  assert.equal(events[3].text, 'Done.');
});

test('runtime tool loop preserves verified file mutation metadata from tool results', async () => {
  const result = await runRuntimeToolLoop({
    maxRounds: 2,
    initialPrompt: 'Update the config file.',
    systemPrompt: 'Use tools when useful.',
    allowedTools: ['write'],
    callModel: async (messages) =>
      messages.length === 1
        ? toolUse('write', { file_path: 'src/config.ts', content: 'export const ok = true;\n' })
        : 'Saved the config file.',
    executeTool: async () => ({
      type: 'text',
      content: 'File successfully written: src/config.ts',
      metadata: {
        fileChanges: [
          {
            path: 'src/config.ts',
            operation: 'write',
            beforeContent: null,
            afterContent: 'export const ok = true;\n',
            verified: true,
          },
        ],
      },
    }),
  });

  assert.equal(result.toolCalls.length, 1);
  assert.deepEqual(result.toolCalls[0].fileChanges, [
    {
      path: 'src/config.ts',
      operation: 'write',
      beforeContent: null,
      afterContent: 'export const ok = true;\n',
      verified: true,
    },
  ]);
});

test('runtime tool loop defers streamed write tools until the model response completes', async () => {
  let modelFinished = false;
  const executedAfterModel = [];

  await runRuntimeToolLoop({
    maxRounds: 2,
    initialPrompt: 'Update the config file.',
    systemPrompt: 'Use tools when useful.',
    allowedTools: ['write'],
    callModel: async (messages, _systemPrompt, onEvent) => {
      if (messages.length > 1) {
        return 'Saved.';
      }
      onEvent?.({
        kind: 'text',
        delta: toolUse('write', { file_path: 'src/config.ts', content: 'export const ok = true;\n' }),
      });
      await Promise.resolve();
      modelFinished = true;
      return toolUse('write', { file_path: 'src/config.ts', content: 'export const ok = true;\n' });
    },
    executeTool: async () => {
      executedAfterModel.push(modelFinished);
      return {
        type: 'text',
        content: 'File successfully written: src/config.ts',
      };
    },
  });

  assert.deepEqual(executedAfterModel, [true]);
});

test('runtime tool loop checks allowed tools before approval hooks', async () => {
  let beforeToolCallCount = 0;

  const result = await runRuntimeToolLoop({
    maxRounds: 2,
    initialPrompt: 'Run a shell command.',
    systemPrompt: 'Use tools when useful.',
    allowedTools: ['view'],
    callModel: async (messages) =>
      messages.length === 1 ? toolUse('bash', { command: 'echo hi' }) : 'I cannot run that command.',
    beforeToolCall: async () => {
      beforeToolCallCount += 1;
    },
    executeTool: async () => {
      throw new Error('executeTool should not be called for blocked tools');
    },
  });

  assert.equal(result.finalContent, 'I cannot run that command.');
  assert.equal(beforeToolCallCount, 0);
  assert.equal(result.toolCalls[0].status, 'blocked');
});

test('runtime tool loop asks the model to repair malformed tool protocol even with visible text', async () => {
  const modelMessages = [];

  const result = await runRuntimeToolLoop({
    maxRounds: 2,
    initialPrompt: 'Inspect the app file.',
    systemPrompt: 'Use tools when useful.',
    allowedTools: ['view'],
    callModel: async (messages) => {
      modelMessages.push(messages.map((message) => ({ ...message })));
      return modelMessages.length === 1
        ? 'I will inspect first.\n<tool_use><tool name="view"><tool_params>{"file_path":"src/app.ts"}</tool>'
        : 'The tool call was malformed, so I will answer directly.';
    },
    executeTool: async () => {
      throw new Error('Malformed tool call should not execute');
    },
  });

  assert.equal(
    result.finalContent,
    'I will inspect first.\n\nThe tool call was malformed, so I will answer directly.',
  );
  assert.equal(modelMessages.length, 2);
  assert.match(modelMessages[1].at(-1).content, /not in a parseable format/);
});

test('runtime tool loop proactively compacts large old tool results before the next model call', async () => {
  const largeToolOutput = 'x'.repeat(5000);
  let secondModelMessages = null;
  let modelCallCount = 0;

  const result = await runRuntimeToolLoop({
    maxRounds: 2,
    contextWindowTokens: 400,
    initialPrompt: 'Inspect the app file.',
    systemPrompt: 'Use tools when useful.',
    allowedTools: ['view'],
    callModel: async (messages) => {
      modelCallCount += 1;
      if (modelCallCount === 1) {
        return toolUse('view', { file_path: 'src/app.ts' });
      }
      secondModelMessages = messages.map((message) => ({ ...message }));
      return 'Done.';
    },
    executeTool: async () => ({
      type: 'text',
      content: largeToolOutput,
    }),
  });

  assert.equal(result.finalContent, 'Done.');
  assert.ok(secondModelMessages, 'expected a second model call');
  const compactedToolResult = secondModelMessages.find((message) =>
    message.content.includes('Tool "view" completed. Output')
  );
  assert.ok(compactedToolResult, 'expected the old tool result to be summarized');
  assert.doesNotMatch(compactedToolResult.content, new RegExp(`x{2000}`));
});
