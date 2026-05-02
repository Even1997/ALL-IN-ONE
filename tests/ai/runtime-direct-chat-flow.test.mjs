import assert from 'node:assert/strict';
import test from 'node:test';

const loadFlow = async () =>
  import(`../../src/modules/ai/runtime/orchestration/runtimeDirectChatFlow.ts?test=${Date.now()}`);

test('runtime direct chat flow builds a prompt with runtime instructions, memory, references, and labels', async () => {
  const { buildRuntimeDirectChatRequest } = await loadFlow();

  const directChat = buildRuntimeDirectChatRequest({
    projectId: 'project-1',
    projectName: 'Alpha',
    threadId: 'thread-1',
    userInput: '请继续实现按钮交互',
    agentsInstructions: ['当前文件: src/app.tsx', '保持现有布局'],
    referenceFiles: [
      {
        id: 'ref-1',
        path: 'docs/spec.md',
        title: 'Spec',
        summary: '按钮需要 loading 态',
        content: '按钮在提交后要显示 loading，并在成功后恢复。',
        type: 'md',
        group: 'project',
        source: 'user',
        updatedAt: '2026-05-02T00:00:00.000Z',
        relatedIds: [],
        tags: ['ui'],
        readableByAI: true,
      },
    ],
    memoryEntries: [
      {
        id: 'memory-1',
        projectId: 'project-1',
        threadId: 'thread-1',
        scope: 'thread',
        label: 'User preference',
        content: '回答保持简洁',
        kind: 'userPreference',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    activeSkills: [
      {
        id: 'skill-1',
        name: 'frontend-polish',
        description: 'Polish UI copy',
        prompt: 'Preserve the existing visual language.',
      },
    ],
    currentProjectName: 'Alpha',
    contextWindowTokens: 32000,
    skillIntent: null,
    conversationHistory: [
      { role: 'user', content: '之前我们在改登录页。' },
      { role: 'assistant', content: '我已经接好了表单校验。' },
    ],
    contextLabels: ['当前 AI / GPT', '当前文件 / src/app.tsx'],
  });

  assert.match(directChat.systemPrompt, /Alpha/);
  assert.match(directChat.prompt, /conversation_history:/);
  assert.match(directChat.prompt, /<instructions>/);
  assert.match(directChat.prompt, /<skills>/);
  assert.match(directChat.prompt, /<memory>/);
  assert.match(directChat.prompt, /<references>/);
  assert.match(directChat.prompt, /reference_index:/);
  assert.match(directChat.prompt, /active_context:/);
});

test('runtime direct chat flow normalizes streamed content, raw response, and empty fallback', async () => {
  const { normalizeRuntimeDirectChatResponse } = await loadFlow();

  assert.equal(
    normalizeRuntimeDirectChatResponse({
      response: 'plain response',
      streamedContent: 'streamed answer',
    }),
    'streamed answer'
  );
  assert.equal(
    normalizeRuntimeDirectChatResponse({
      response: 'plain response',
      streamedContent: '   ',
    }),
    'plain response'
  );
  assert.equal(
    normalizeRuntimeDirectChatResponse({
      response: '   ',
      streamedContent: '   ',
    }),
    '已收到请求，但这次没有返回内容。'
  );
});
