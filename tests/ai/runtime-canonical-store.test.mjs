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
  assert.equal(storedSession.canonicalEvents[0].seq, 99);
});

test('chat store de-duplicates canonical events by event id while preserving the latest payload', async () => {
  const { createChatSession, useAIChatStore } = await loadChatStore();

  const projectId = 'project_2';
  const session = createChatSession(projectId, 'Canonical dedupe', 'built-in');

  useAIChatStore.getState().upsertSession(projectId, session);
  useAIChatStore.getState().appendCanonicalEvent(projectId, session.id, {
    eventId: 'evt_dup',
    runId: 'run_1',
    turnId: 'turn_1',
    sessionId: session.id,
    type: 'warning.raised',
    ts: 1,
    seq: 1,
    source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
    payload: { code: 'warn', summary: 'first summary' },
  });
  useAIChatStore.getState().appendCanonicalEvent(projectId, session.id, {
    eventId: 'evt_dup',
    runId: 'run_1',
    turnId: 'turn_1',
    sessionId: session.id,
    type: 'warning.raised',
    ts: 2,
    seq: 2,
    source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
    payload: { code: 'warn', summary: 'latest summary' },
  });

  const storedSession = useAIChatStore.getState().projects[projectId].sessions[0];
  assert.equal(storedSession.canonicalEvents.length, 1);
  assert.equal(storedSession.canonicalEvents[0].payload.summary, 'latest summary');
  assert.equal(storedSession.canonicalEvents[0].seq, 2);
});
