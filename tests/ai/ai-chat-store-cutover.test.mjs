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

const loadStore = async (storage) => {
  globalThis.localStorage = storage;
  return import(`../../src/modules/ai/store/aiChatStore.ts?test=${Date.now()}`);
};

test('ai chat store version cutover clears old XML-era persisted sessions', async () => {
  const storage = new MemoryStorage();
  storage.setItem(
    'goodnight-ai-chat-store',
    JSON.stringify({
      state: {
        projects: {
          project_old: {
            activeSessionId: 'session_old',
            activityEntries: [],
            sessions: [
              {
                id: 'session_old',
                projectId: 'project_old',
                title: 'Old XML chat',
                providerId: 'built-in',
                messages: [
                  {
                    id: 'assistant_old',
                    role: 'assistant',
                    content: '<think>old</think><final>answer</final>',
                    createdAt: 1,
                  },
                ],
                createdAt: 1,
                updatedAt: 1,
              },
            ],
          },
        },
      },
      version: 4,
    }),
  );

  const { useAIChatStore } = await loadStore(storage);

  assert.deepEqual(useAIChatStore.getState().projects, {});
});
