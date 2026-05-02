import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runtimeStorePath = path.resolve(__dirname, '../../src/modules/ai/runtime/agentRuntimeStore.ts');
const runtimeClientPath = path.resolve(__dirname, '../../src/modules/ai/runtime/agentRuntimeClient.ts');

const loadRuntimeStore = async () => import(`../../src/modules/ai/runtime/agentRuntimeStore.ts?test=${Date.now()}`);
const loadAIChatStore = async (storage = new MemoryStorage()) => {
  globalThis.localStorage = storage;
  return import(`../../src/modules/ai/store/aiChatStore.ts?test=${Date.now()}`);
};

test('agent runtime store tracks threads, turns, timeline events, and hydration state', async () => {
  const { useAgentRuntimeStore } = await loadRuntimeStore();
  const store = useAgentRuntimeStore.getState();

  store.setHydrating(true);
  store.createThread('project-1', {
    id: 'thread-1',
    providerId: 'codex',
    title: 'Agent thread',
    createdAt: 10,
    updatedAt: 10,
  });
  store.submitTurn('thread-1', {
    id: 'turn-1',
    threadId: 'thread-1',
    providerId: 'codex',
    status: 'running',
    prompt: 'Summarize the project',
    createdAt: 11,
    completedAt: null,
  });
  store.appendTimelineEvent('thread-1', {
    id: 'event-1',
    threadId: 'thread-1',
    providerId: 'codex',
    summary: 'Thinking about project context',
    createdAt: 12,
  });
  store.setMemoryEntries('project-1', [
    {
      id: 'memory-1',
      threadId: 'thread-1',
      label: 'projectFact',
      content: 'Use runtime-backed agent threads',
      createdAt: 13,
    },
  ]);
  store.setActiveSkills('thread-1', [
    {
      id: 'requirements',
      name: 'Requirements',
      prompt: 'Clarify scope first',
    },
  ]);
  store.setRuntimeBinding('thread-1', {
    providerId: 'codex',
    configId: 'cfg-1',
    externalThreadId: 'ext-thread-1',
  });
  store.startRun('thread-1');
  store.appendStreamDelta('thread-1', 'partial');
  store.finishRun('thread-1');
  store.setRecoveryState('thread-1', {
    threadId: 'thread-1',
    replayThreadId: 'runtime-thread-1',
    replayEventCount: 1,
    lastEventType: 'turn_started',
    lastEventAt: 14,
    lastOutcome: 'interrupted',
    resumeState: 'ready',
    resumeKind: 'resume-latest-prompt',
    resumeActionLabel: '恢复最近一次输入',
    resumePrompt: 'Retry last turn',
    summary: 'Interrupted turn can be resumed.',
  });
  store.requestReplayResumeFromRecovery('thread-1', {
    threadId: 'thread-1',
    replayThreadId: 'runtime-thread-1',
    replayEventCount: 1,
    lastEventType: 'turn_started',
    lastEventAt: 14,
    lastOutcome: 'interrupted',
    resumeState: 'ready',
    resumeKind: 'resume-latest-prompt',
    resumeActionLabel: '恢复最近一次输入',
    resumePrompt: 'Retry last turn',
    summary: 'Interrupted turn can be resumed.',
  });

  const nextState = useAgentRuntimeStore.getState();
  assert.equal(nextState.isHydrating, true);
  assert.equal(nextState.threadsByProject['project-1'][0].id, 'thread-1');
  assert.equal(nextState.turnsByThread['thread-1'][0].id, 'turn-1');
  assert.equal(nextState.timelineByThread['thread-1'][0].id, 'event-1');
  assert.equal(nextState.memoryByProject['project-1'][0].id, 'memory-1');
  assert.equal(nextState.activeSkillsByThread['thread-1'][0].id, 'requirements');
  assert.equal(nextState.bindingByThread['thread-1'].configId, 'cfg-1');
  assert.equal(nextState.runStateByThread['thread-1'].status, 'idle');
  assert.equal(nextState.runStateByThread['thread-1'].draft, 'partial');
  assert.equal(nextState.recoveryByThread['thread-1'].resumeState, 'ready');
  assert.equal(nextState.resumeRequestsByThread['thread-1'].prompt, 'Retry last turn');
  assert.equal(nextState.resumeRequestsByThread['thread-1'].resumeKind, 'resume-latest-prompt');
  assert.equal(nextState.resumeRequestsByThread['thread-1'].actionLabel, '恢复最近一次输入');

  nextState.clearReplayResumeRequest('thread-1');
  assert.equal(useAgentRuntimeStore.getState().resumeRequestsByThread['thread-1'], undefined);
});

test('agent runtime client exposes thread, memory, and prompt execution APIs', async () => {
  const source = await readFile(runtimeClientPath, 'utf8');

  assert.match(source, /createAgentThread/);
  assert.match(source, /listAgentThreads/);
  assert.match(source, /appendAgentTimelineEvent/);
  assert.match(source, /saveProjectMemoryEntry/);
  assert.match(source, /listProjectMemoryEntries/);
  assert.match(source, /executePrompt/);
});

test('chat sessions can carry runtime provider and external thread metadata', async () => {
  const { createChatSession } = await loadAIChatStore();
  const session = createChatSession('project-runtime', 'Runtime session', 'claude');

  assert.equal(session.providerId, 'claude');
  assert.equal(session.runtimeThreadId, null);
});
