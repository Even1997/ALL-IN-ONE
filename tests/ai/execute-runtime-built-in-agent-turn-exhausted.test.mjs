import assert from 'node:assert/strict';
import test from 'node:test';

const loadBuiltInTurn = async () =>
  import(`../../src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts?test=${Date.now()}`);

test('built-in runtime retries with a direct answer when the tool loop exhausts', async () => {
  const { executeRuntimeBuiltInAgentTurn } = await loadBuiltInTurn();

  let callCount = 0;
  const result = await executeRuntimeBuiltInAgentTurn({
    projectId: 'project-1',
    projectName: 'GoodNight',
    threadId: 'thread-1',
    projectRoot: 'C:/repo/demo',
    userInput: 'Where is the built-in AI smoke test entry point?',
    rawUserInput: 'Where is the built-in AI smoke test entry point?',
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
        return 'Runtime tool loop exhausted after 8 rounds before the model returned final content.';
      }

      assert.match(prompt, /The previous attempt exhausted the tool loop/i);
      assert.match(prompt, /Do not call any more tools\./i);
      return 'scripts/test-builtin-ai-smoke.ps1';
    },
    executeTool: async () => ({
      type: 'text',
      content: 'unused',
    }),
  });

  assert.equal(callCount, 2);
  assert.equal(result.finalContent, 'scripts/test-builtin-ai-smoke.ps1');
});
