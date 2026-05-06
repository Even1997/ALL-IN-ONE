import assert from 'node:assert/strict';
import test from 'node:test';

const loadBuiltInTurn = async () =>
  import(`../../src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts?test=${Date.now()}`);

test('built-in runtime retries project-fact questions with tool grounding when the first answer used no tools', async () => {
  const { executeRuntimeBuiltInAgentTurn } = await loadBuiltInTurn();

  let callCount = 0;
  const result = await executeRuntimeBuiltInAgentTurn({
    projectId: 'project-1',
    projectName: 'GoodNight',
    threadId: 'thread-1',
    projectRoot: 'C:/repo/demo',
    userInput: 'List two built-in AI test entry points in this project.',
    rawUserInput: 'List two built-in AI test entry points in this project.',
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
        return 'src/core/builtin_ai_smoke.py';
      }
      if (callCount === 2) {
        assert.match(prompt, /current-project facts/i);
        assert.match(prompt, /Inspect the project with read-only tools/i);
        return '<tool_use>\n<tool name="view">\n<tool_params>{"file_path":"package.json","limit":20}</tool_params>\n</tool>\n</tool_use>';
      }

      return 'scripts/test-builtin-ai-smoke.ps1 and scripts/test-builtin-ai-turns.cjs';
    },
    executeTool: async () => ({
      type: 'text',
      content: '1: {\n2:   "scripts": {\n3:     "test:builtin-ai-smoke": "...",\n4:     "test:builtin-ai-turns": "..."\n5:   }\n6: }',
    }),
  });

  assert.equal(callCount, 3);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, 'view');
  assert.equal(result.finalContent, 'scripts/test-builtin-ai-smoke.ps1 and scripts/test-builtin-ai-turns.cjs');
});

test('built-in runtime asks again for grounding when the first retry still answers without tools', async () => {
  const { executeRuntimeBuiltInAgentTurn } = await loadBuiltInTurn();

  let callCount = 0;
  const result = await executeRuntimeBuiltInAgentTurn({
    projectId: 'project-1',
    projectName: 'GoodNight',
    threadId: 'thread-2',
    projectRoot: 'C:/repo/demo',
    userInput: '这个项目里的 built-in AI 测试入口在哪里？给我最短答案。',
    rawUserInput: '这个项目里的 built-in AI 测试入口在哪里？给我最短答案。',
    conversationHistory: [],
    agentInstructions: [],
    referenceFiles: [],
    memoryEntries: [],
    activeSkills: [],
    skillIntent: null,
    contextLabels: [],
    allowedTools: ['glob', 'view'],
    executeModel: async (prompt) => {
      callCount += 1;
      if (callCount === 1) {
        return '在 `src/pages/ai-test/` 下，路由 `/ai-test`。';
      }
      if (callCount === 2) {
        assert.match(prompt, /Inspect the project with read-only tools/i);
        return '在 `src/pages/ai-test/` 下，路由 `/ai-test`。';
      }
      if (callCount === 3) {
        assert.match(prompt, /Your previous reply still did not inspect the project/i);
        assert.match(prompt, /must call at least one read-only tool/i);
        return '<tool_use>\n<tool name="glob">\n<tool_params>{"pattern":"**/*builtin*ai*"}</tool_params>\n</tool>\n</tool_use>';
      }

      return 'scripts/test-builtin-ai-smoke.cjs';
    },
    executeTool: async () => ({
      type: 'text',
      content: 'scripts/test-builtin-ai-smoke.cjs\nscripts/test-builtin-ai-turns.cjs',
    }),
  });

  assert.equal(callCount, 4);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, 'glob');
  assert.equal(result.finalContent, 'scripts/test-builtin-ai-smoke.cjs');
});
