import assert from 'node:assert/strict';
import test from 'node:test';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

const loadStore = async () => {
  globalThis.localStorage = new MemoryStorage();
  return import(`../../src/modules/ai/store/aiChatStore.ts?test=${Date.now()}`);
};

test('ai chat store saves complete project sessions and keeps messages intact', async () => {
  const { useAIChatStore, createChatSession, createStoredChatMessage } = await loadStore();
  const store = useAIChatStore.getState();

  const session = createChatSession('project-1', '默认会话');
  store.upsertSession('project-1', session);
  store.appendMessage('project-1', session.id, createStoredChatMessage('user', '@需求 帮我整理登录流程'));
  store.appendMessage('project-1', session.id, createStoredChatMessage('assistant', '这里是完整回复'));

  const savedSession = useAIChatStore.getState().projects['project-1'].sessions[0];
  assert.equal(savedSession.messages.length, 2);
  assert.equal(savedSession.messages[0].content, '@需求 帮我整理登录流程');
  assert.equal(savedSession.messages[1].content, '这里是完整回复');
});

test('ai chat store keeps active session per project', async () => {
  const { useAIChatStore, createChatSession } = await loadStore();
  const store = useAIChatStore.getState();

  const first = createChatSession('project-2', '会话 A');
  const second = createChatSession('project-2', '会话 B');
  store.upsertSession('project-2', first);
  store.upsertSession('project-2', second);
  store.setActiveSession('project-2', first.id);
  store.setActiveSession('project-2', second.id);

  const projectState = useAIChatStore.getState().projects['project-2'];
  assert.equal(projectState.activeSessionId, second.id);
  assert.equal(projectState.sessions[0].id, second.id);
});

test('ai chat store persists project activity entries separately from chat history', async () => {
  const { useAIChatStore } = await loadStore();
  const store = useAIChatStore.getState();

  store.ensureProjectState('project-log');
  store.appendActivityEntry('project-log', {
    id: 'activity_1',
    runId: 'run_1',
    type: 'run-summary',
    summary: '更新了 knowledge/spec.md',
    changedPaths: ['knowledge/spec.md'],
    createdAt: 1,
  });

  const projectState = useAIChatStore.getState().projects['project-log'];
  assert.equal(projectState.activityEntries.length, 1);
  assert.equal(projectState.activityEntries[0].changedPaths[0], 'knowledge/spec.md');
});

test('latest activity entries are kept in reverse chronological order', async () => {
  const { useAIChatStore } = await loadStore();
  const store = useAIChatStore.getState();

  store.ensureProjectState('project-order');
  store.appendActivityEntry('project-order', {
    id: 'a1',
    runId: 'run_1',
    type: 'run-summary',
    summary: 'first',
    changedPaths: ['a.md'],
    createdAt: 1,
  });
  store.appendActivityEntry('project-order', {
    id: 'a2',
    runId: 'run_2',
    type: 'run-summary',
    summary: 'second',
    changedPaths: ['b.md'],
    createdAt: 2,
  });

  const entries = useAIChatStore.getState().projects['project-order'].activityEntries;
  assert.equal(entries[0].id, 'a2');
});

test('ai chat store keeps assistant knowledge proposal metadata intact', async () => {
  const { useAIChatStore, createChatSession, createStoredChatMessage } = await loadStore();
  const store = useAIChatStore.getState();

  const session = createChatSession('project-proposal', '知识库提案');
  store.upsertSession('project-proposal', session);
  store.appendMessage('project-proposal', session.id, {
    ...createStoredChatMessage('assistant', '我发现知识库里有 1 项建议。'),
    knowledgeProposal: {
      id: 'proposal-1',
      projectId: 'project-proposal',
      summary: '发现 1 项 wiki 更新建议',
      trigger: 'wiki-stale',
      status: 'pending',
      createdAt: 1,
      operations: [
        {
          id: 'op-1',
          type: 'update_wiki',
          targetTitle: '项目总览.md',
          reason: 'onboarding 流程已变更',
          evidence: ['note:登录讨论.md'],
          draftContent: '# 项目总览',
          riskLevel: 'low',
          selected: true,
        },
      ],
    },
  });

  const savedMessage = useAIChatStore.getState().projects['project-proposal'].sessions[0].messages[0];
  assert.equal(savedMessage.knowledgeProposal.summary, '发现 1 项 wiki 更新建议');
  assert.equal(savedMessage.knowledgeProposal.operations[0].selected, true);
});
test('ai chat store keeps assistant structured cards intact', async () => {
  const { useAIChatStore, createChatSession, createStoredChatMessage } = await loadStore();
  const store = useAIChatStore.getState();

  const session = createChatSession('project-cards', '知识会话');
  store.upsertSession('project-cards', session);
  store.appendMessage('project-cards', session.id, {
    ...createStoredChatMessage('assistant', '我识别到了 2 条知识变化。'),
    structuredCards: [
      {
        type: 'summary',
        title: '本轮识别结果',
        body: '新增 1 条，冲突 1 条。',
      },
      {
        type: 'next-step',
        title: '下一步建议',
        actions: [{ id: 'review-conflicts', label: '先确认冲突', prompt: '先确认冲突' }],
      },
    ],
  });

  const savedMessage = useAIChatStore.getState().projects['project-cards'].sessions[0].messages[0];
  assert.equal(savedMessage.structuredCards[0].type, 'summary');
  assert.equal(savedMessage.structuredCards[1].actions[0].label, '先确认冲突');
});
