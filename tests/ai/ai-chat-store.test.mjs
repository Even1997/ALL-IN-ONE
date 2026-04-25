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
