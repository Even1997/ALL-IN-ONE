import assert from 'node:assert/strict';
import test from 'node:test';

import { runAgentTurn } from '../../src/modules/ai/runtime/agent-kernel/runAgentTurn.ts';

const toolUse = (name, input) => `<tool_use>
<tool name="${name}">
<tool_params>${JSON.stringify(input)}</tool_params>
</tool>
</tool_use>`;

test('runAgentTurn keeps a structured transcript instead of only a flattened role-content log', async () => {
  const modelInputs = [];

  const result = await runAgentTurn({
    projectId: 'project-1',
    projectName: 'demo',
    threadId: 'thread-1',
    userInput: 'Inspect the app file.',
    conversationHistory: [],
    instructions: [],
    referenceFiles: [],
    memoryEntries: [],
    activeSkills: [],
    executeModel: async (prompt) => {
      modelInputs.push(prompt);
      return modelInputs.length === 1
        ? toolUse('view', { file_path: 'src/app.ts' })
        : 'The file contains the app entry point.';
    },
    executeTool: async () => ({
      type: 'text',
      content: '1: console.log("app");',
    }),
  });

  assert.equal(typeof modelInputs[0], 'object');
  assert.equal(Array.isArray(modelInputs[0]), true);
  assert.deepEqual(
    result.transcript.map((message) => message.kind),
    ['user', 'assistant_tool_call', 'tool_result', 'assistant_text'],
  );
  assert.equal(result.transcript[1].toolCallId, result.toolCalls[0].id);
  assert.equal(result.transcript[2].toolCallId, result.toolCalls[0].id);
});
