import assert from 'node:assert/strict';
import test from 'node:test';

const loadBuiltInTurn = async () =>
  import(`../../src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts?test=${Date.now()}`);

test('built-in runtime retries when the final reply refers to hidden earlier text', async () => {
  const { executeRuntimeBuiltInAgentTurn } = await loadBuiltInTurn();

  let callCount = 0;
  const result = await executeRuntimeBuiltInAgentTurn({
    projectId: 'project-1',
    projectName: 'GoodNight',
    threadId: 'thread-1',
    projectRoot: 'C:/repo/demo',
    userInput: 'Summarize this project.',
    rawUserInput: 'Summarize this project.',
    conversationHistory: [],
    agentInstructions: [],
    referenceFiles: [],
    memoryEntries: [],
    activeSkills: [],
    skillIntent: null,
    contextLabels: [],
    allowedTools: ['view'],
    executeModel: async (prompt) => {
      callCount += 1;
      if (callCount === 1) {
        return '<tool_use>\n<tool name="view">\n<tool_params>{"file_path":"README.md","limit":20}</tool_params>\n</tool>\n</tool_use>';
      }
      if (callCount === 2) {
        return 'The summary above already covers the project.';
      }

      assert.match(prompt, /not standalone/i);
      assert.match(prompt, /Return a complete standalone final answer now\./i);
      return 'GoodNight is a visual software development workbench built with Vite, React, TypeScript, and Tauri.';
    },
    executeTool: async () => ({
      type: 'text',
      content: '1: # GoodNight',
    }),
  });

  assert.equal(callCount, 3);
  assert.equal(
    result.finalContent,
    'GoodNight is a visual software development workbench built with Vite, React, TypeScript, and Tauri.'
  );
});
