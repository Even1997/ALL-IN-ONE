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
}

const loadChatStore = async (storage = new MemoryStorage()) => {
  globalThis.localStorage = storage;
  return import(`../../src/modules/ai/store/aiChatStore.ts?test=${Date.now()}`);
};

test('chat store appends canonical events and restores them with the session', async () => {
  const { createChatSession, useAIChatStore } = await loadChatStore();

  const projectId = 'project_1';
  const session = createChatSession(projectId, 'Timeline test', 'built-in');

  useAIChatStore.getState().upsertSession(projectId, session);
  useAIChatStore.getState().appendCanonicalEvent(projectId, session.id, {
    eventId: 'evt_1',
    runId: 'run_1',
    turnId: 'turn_1',
    sessionId: 'other_session',
    type: 'progress.updated',
    ts: 1,
    seq: 99,
    source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
    payload: { label: '正在扫描目录' },
  });

  const storedSession = useAIChatStore.getState().projects[projectId].sessions[0];
  assert.equal(storedSession.canonicalEvents.length, 1);
  assert.equal(storedSession.canonicalEvents[0].type, 'progress.updated');
  assert.equal(storedSession.canonicalEvents[0].sessionId, session.id);
  assert.equal(storedSession.canonicalEvents[0].seq, 1);
});
