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

const loadStore = async (storage = new MemoryStorage()) => {
  globalThis.localStorage = storage;
  return import(`../../src/modules/ai/store/aiChatStore.ts?test=${Date.now()}`);
};
const loadEventLog = async () =>
  import(`../../src/modules/ai/store/chatSessionEventLog.ts?test=${Date.now()}`);

test('ai chat store saves complete project sessions and keeps messages intact', async () => {
  const { useAIChatStore, createChatSession, createStoredChatMessage } = await loadStore();
  const store = useAIChatStore.getState();

  const session = createChatSession('project-1', 'Default chat');
  store.upsertSession('project-1', session);
  store.appendMessage('project-1', session.id, createStoredChatMessage('user', '@requirements help me'));
  store.appendMessage('project-1', session.id, createStoredChatMessage('assistant', 'Complete answer'));

  const savedSession = useAIChatStore.getState().projects['project-1'].sessions[0];
  assert.equal(savedSession.messages.length, 2);
  assert.equal(savedSession.messages[0].content, '@requirements help me');
  assert.equal(savedSession.messages[1].timeline[0].content, 'Complete answer');
  assert.equal('content' in savedSession.messages[1], false);
  assert.equal(Array.isArray(savedSession.eventLog), true);
  assert.equal(savedSession.eventLog.some((event) => event.kind === 'session_initialized'), true);
  assert.equal(savedSession.eventLog.filter((event) => event.kind === 'message_appended').length, 2);
});

test('assistant messages store reasoning and text only in timeline', async () => {
  const { createStoredChatMessage } = await loadStore();
  const message = createStoredChatMessage('assistant', '<think>Analyze first</think>\n\nFinal answer');

  assert.equal(message.role, 'assistant');
  assert.equal('content' in message, false);
  assert.equal('thinkingContent' in message, false);
  assert.equal('answerContent' in message, false);
  assert.equal('assistantParts' in message, false);
  assert.equal('runtimeEvents' in message, false);
  assert.deepEqual(
    message.timeline.map((event) => [event.kind, event.content]),
    [
      ['reasoning', 'Analyze first'],
      ['text', 'Final answer'],
    ]
  );
});

test('assistant messages persist mixed runtime timeline events without reintroducing content fields', async () => {
  const { useAIChatStore, createChatSession, createStoredChatMessage } = await loadStore();
  const store = useAIChatStore.getState();

  const session = createChatSession('project-runtime', 'Runtime chat');
  store.upsertSession('project-runtime', session);
  store.appendMessage('project-runtime', session.id, {
    ...createStoredChatMessage('assistant', 'Runtime answer'),
    timeline: [
      ...createStoredChatMessage('assistant', '<think>Inspect</think>\n\nRuntime answer').timeline,
      {
        id: 'approval-event-1',
        kind: 'approval',
        approvalId: 'approval-1',
        toolCallId: 'call-1',
        actionType: 'bash',
        summary: 'Run command',
        riskLevel: 'high',
        status: 'pending',
        createdAt: Date.now() + 1,
      },
    ],
  });

  const savedMessage = useAIChatStore.getState().projects['project-runtime'].sessions[0].messages[0];
  assert.equal(savedMessage.role, 'assistant');
  assert.equal('content' in savedMessage, false);
  assert.deepEqual(
    savedMessage.timeline.map((event) => event.kind),
    ['reasoning', 'text', 'approval'],
  );
});

test('ai chat store keeps active session per project', async () => {
  const { useAIChatStore, createChatSession } = await loadStore();
  const store = useAIChatStore.getState();

  const first = createChatSession('project-2', 'Chat A');
  const second = createChatSession('project-2', 'Chat B');
  store.upsertSession('project-2', first);
  store.upsertSession('project-2', second);
  store.setActiveSession('project-2', first.id);
  store.setActiveSession('project-2', second.id);

  const projectState = useAIChatStore.getState().projects['project-2'];
  assert.equal(projectState.activeSessionId, second.id);
  assert.equal(projectState.sessions[0].id, second.id);
});

test('ai chat store derives session metadata updates from the session event log', async () => {
  const { useAIChatStore, createChatSession } = await loadStore();
  const store = useAIChatStore.getState();

  const session = createChatSession('project-events', 'Chat A');
  store.upsertSession('project-events', session);
  store.renameSession('project-events', session.id, 'Renamed chat');
  store.queueComposerPrefill('project-events', session.id, 'Continue from plan');
  store.bindRuntimeThread('project-events', session.id, 'built-in', 'thread-1');

  const savedSession = useAIChatStore.getState().projects['project-events'].sessions[0];
  assert.equal(savedSession.title, 'Renamed chat');
  assert.equal(savedSession.composerPrefill.prompt, 'Continue from plan');
  assert.equal(savedSession.runtimeThreadId, 'thread-1');
  assert.equal(savedSession.eventLog.some((event) => event.kind === 'title_renamed'), true);
  assert.equal(savedSession.eventLog.some((event) => event.kind === 'composer_prefill_queued'), true);
  assert.equal(savedSession.eventLog.some((event) => event.kind === 'runtime_thread_bound'), true);
});

test('ai chat store persists replay events and recovery state through session event log projection', async () => {
  const { useAIChatStore, createChatSession } = await loadStore();
  const store = useAIChatStore.getState();

  const session = createChatSession('project-replay', 'Replay chat');
  store.upsertSession('project-replay', session);
  store.syncSessionReplayState(
    'project-replay',
    session.id,
    'thread-replay-1',
    [
      {
        id: 'replay-1',
        threadId: 'thread-replay-1',
        eventType: 'turn_started',
        payload: '{"kind":"turn_start_v1","rawPrompt":"hello","normalizedPrompt":"hello","skillIntent":null,"activeSkillIds":[]}',
        createdAt: 1,
      },
    ],
    {
      threadId: 'thread-replay-1',
      replayThreadId: 'thread-replay-1',
      replayEventCount: 1,
      lastEventType: 'turn_started',
      lastEventAt: 1,
      lastOutcome: 'interrupted',
      resumeState: 'ready',
      resumeKind: 'resume-latest-prompt',
      resumeActionLabel: 'Resume latest prompt',
      resumePrompt: 'hello',
      resumeSkillSnapshot: null,
      latestSkillSnapshot: null,
      summary: 'Interrupted',
    }
  );

  const savedSession = useAIChatStore.getState().projects['project-replay'].sessions[0];
  assert.equal(savedSession.replayEvents.length, 1);
  assert.equal(savedSession.recoveryState?.resumeState, 'ready');
  assert.equal(savedSession.eventLog.some((event) => event.kind === 'replay_state_synced'), true);
});

test('ai chat store migrates persisted replay state into the session event log projection', async () => {
  const storage = new MemoryStorage();
  storage.setItem(
    'goodnight-ai-chat-store',
    JSON.stringify({
      state: {
        projects: {
          'project-replay-migrate': {
            activeSessionId: 'session-replay-1',
            activityEntries: [],
            sessions: [
              {
                id: 'session-replay-1',
                projectId: 'project-replay-migrate',
                title: 'Replay migration',
                providerId: 'built-in',
                runtimeThreadId: 'runtime-thread-1',
                composerPrefill: null,
                messages: [],
                replayEvents: [
                  {
                    id: 'replay-1',
                    threadId: 'runtime-thread-1',
                    eventType: 'turn_started',
                    payload:
                      '{"kind":"turn_start_v1","rawPrompt":"resume me","normalizedPrompt":"resume me","skillIntent":null,"activeSkillIds":["requirements"]}',
                    createdAt: 5,
                  },
                ],
                recoveryState: {
                  threadId: 'runtime-thread-1',
                  replayThreadId: 'runtime-thread-1',
                  replayEventCount: 1,
                  lastEventType: 'turn_started',
                  lastEventAt: 5,
                  lastOutcome: 'interrupted',
                  resumeState: 'ready',
                  resumeKind: 'resume-latest-prompt',
                  resumeActionLabel: 'Resume latest prompt',
                  resumePrompt: 'resume me',
                  resumeSkillSnapshot: null,
                  latestSkillSnapshot: null,
                  summary: 'Interrupted',
                },
                createdAt: 1,
                updatedAt: 5,
              },
            ],
          },
        },
      },
      version: 3,
    })
  );

  const [{ useAIChatStore }, { buildChatSessionProjection }] = await Promise.all([
    loadStore(storage),
    loadEventLog(),
  ]);
  const savedSession =
    useAIChatStore.getState().projects['project-replay-migrate'].sessions[0];
  const rebuiltFromEventLog = buildChatSessionProjection(savedSession.id, savedSession.eventLog);

  assert.equal(savedSession.eventLog.some((event) => event.kind === 'replay_state_synced'), true);
  assert.equal(rebuiltFromEventLog?.replayEvents.length, 1);
  assert.equal(rebuiltFromEventLog?.recoveryState?.resumeState, 'ready');
  assert.equal(rebuiltFromEventLog?.recoveryState?.replayThreadId, 'runtime-thread-1');
});

test('ai chat store skips duplicate replay sync snapshots', async () => {
  const { useAIChatStore, createChatSession } = await loadStore();
  const store = useAIChatStore.getState();

  const session = createChatSession('project-replay-dedupe', 'Replay dedupe');
  const replayEvents = [
    {
      id: 'replay-1',
      threadId: 'runtime-thread-2',
      eventType: 'turn_started',
      payload:
        '{"kind":"turn_start_v1","rawPrompt":"hello","normalizedPrompt":"hello","skillIntent":null,"activeSkillIds":[]}',
      createdAt: 10,
    },
  ];
  const recoveryState = {
    threadId: 'runtime-thread-2',
    replayThreadId: 'runtime-thread-2',
    replayEventCount: 1,
    lastEventType: 'turn_started',
    lastEventAt: 10,
    lastOutcome: 'interrupted',
    resumeState: 'ready',
    resumeKind: 'resume-latest-prompt',
    resumeActionLabel: 'Resume latest prompt',
    resumePrompt: 'hello',
    resumeSkillSnapshot: null,
    latestSkillSnapshot: null,
    summary: 'Interrupted',
  };

  store.upsertSession('project-replay-dedupe', session);
  store.syncSessionReplayState(
    'project-replay-dedupe',
    session.id,
    'runtime-thread-2',
    replayEvents,
    recoveryState
  );
  store.syncSessionReplayState(
    'project-replay-dedupe',
    session.id,
    'runtime-thread-2',
    replayEvents,
    recoveryState
  );

  const savedSession =
    useAIChatStore.getState().projects['project-replay-dedupe'].sessions[0];
  assert.equal(
    savedSession.eventLog.filter((event) => event.kind === 'replay_state_synced').length,
    1
  );
});

test('ai chat store persists project activity entries separately from chat history', async () => {
  const { useAIChatStore } = await loadStore();
  const store = useAIChatStore.getState();

  store.ensureProjectState('project-log');
  store.appendActivityEntry('project-log', {
    id: 'activity_1',
    runId: 'run_1',
    type: 'run-summary',
    summary: 'Updated knowledge/spec.md',
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

  const session = createChatSession('project-proposal', 'Knowledge proposal');
  store.upsertSession('project-proposal', session);
  store.appendMessage('project-proposal', session.id, {
    ...createStoredChatMessage('assistant', 'I found 1 knowledge update.'),
    knowledgeProposal: {
      id: 'proposal-1',
      projectId: 'project-proposal',
      summary: 'Found 1 wiki update suggestion',
      trigger: 'wiki-stale',
      status: 'pending',
      createdAt: 1,
      operations: [
        {
          id: 'op-1',
          type: 'update_wiki',
          targetTitle: 'Project overview.md',
          reason: 'onboarding flow changed',
          evidence: ['note:login discussion.md'],
          draftContent: '# Project overview',
          riskLevel: 'low',
          selected: true,
        },
      ],
    },
  });

  const savedMessage = useAIChatStore.getState().projects['project-proposal'].sessions[0].messages[0];
  assert.equal(savedMessage.knowledgeProposal.summary, 'Found 1 wiki update suggestion');
  assert.equal(savedMessage.knowledgeProposal.operations[0].selected, true);
});

test('ai chat store keeps assistant structured cards intact after persistence and rehydration', async () => {
  const storage = new MemoryStorage();
  const { useAIChatStore, createChatSession, createStoredChatMessage } = await loadStore(storage);
  const store = useAIChatStore.getState();

  const session = createChatSession('project-cards', 'Knowledge chat');
  store.upsertSession('project-cards', session);
  store.appendMessage('project-cards', session.id, {
    ...createStoredChatMessage('assistant', 'I identified 2 knowledge changes.'),
    structuredCards: [
      {
        type: 'summary',
        title: 'Run summary',
        body: '1 new item, 1 conflict.',
      },
      {
        type: 'next-step',
        title: 'Next step',
        actions: [{ id: 'review-conflicts', label: 'Review conflicts', prompt: 'Review conflicts' }],
      },
    ],
  });

  const { useAIChatStore: rehydratedStore } = await loadStore(storage);
  const savedMessage = rehydratedStore.getState().projects['project-cards'].sessions[0].messages[0];
  assert.equal(savedMessage.structuredCards[0].type, 'summary');
  assert.equal(savedMessage.structuredCards[1].actions[0].label, 'Review conflicts');
});

test('ai chat store normalizes persisted assistant messages that are missing timeline', async () => {
  const storage = new MemoryStorage();
  storage.setItem(
    'goodnight-ai-chat-store',
    JSON.stringify({
      state: {
        projects: {
          'project-rehydrate': {
            activeSessionId: 'session-1',
            activityEntries: [],
            sessions: [
              {
                id: 'session-1',
                projectId: 'project-rehydrate',
                title: 'Broken persisted chat',
                providerId: 'built-in',
                runtimeThreadId: null,
                composerPrefill: null,
                createdAt: 1,
                updatedAt: 1,
                messages: [
                  {
                    id: 'assistant-1',
                    role: 'assistant',
                    createdAt: 1,
                  },
                ],
              },
            ],
          },
        },
      },
      version: 2,
    })
  );

  const { useAIChatStore } = await loadStore(storage);
  const savedMessage = useAIChatStore.getState().projects['project-rehydrate'].sessions[0].messages[0];

  assert.deepEqual(savedMessage.timeline, []);
  const savedSession = useAIChatStore.getState().projects['project-rehydrate'].sessions[0];
  assert.equal(Array.isArray(savedSession.eventLog), true);
  assert.equal(savedSession.eventLog.some((event) => event.kind === 'session_initialized'), true);
  assert.equal(savedSession.eventLog.some((event) => event.kind === 'message_appended'), true);
});

test('ai chat store does not persist duplicate session event logs to localStorage', async () => {
  const storage = new MemoryStorage();
  const { useAIChatStore, createChatSession, createStoredChatMessage } = await loadStore(storage);
  const store = useAIChatStore.getState();

  const session = createChatSession('project-persist-size', 'Quota guard');
  store.upsertSession('project-persist-size', session);
  store.appendMessage(
    'project-persist-size',
    session.id,
    createStoredChatMessage('user', 'Write a long requirements draft')
  );
  store.appendMessage(
    'project-persist-size',
    session.id,
    createStoredChatMessage('assistant', 'A'.repeat(4000))
  );

  const persisted = JSON.parse(storage.getItem('goodnight-ai-chat-store'));
  const persistedSession = persisted.state.projects['project-persist-size'].sessions[0];

  assert.equal(Array.isArray(persistedSession.messages), true);
  assert.equal('eventLog' in persistedSession, false);

  const { useAIChatStore: rehydratedStore } = await loadStore(storage);
  const rehydratedSession =
    rehydratedStore.getState().projects['project-persist-size'].sessions[0];

  assert.equal(Array.isArray(rehydratedSession.eventLog), true);
  assert.equal(
    rehydratedSession.eventLog.filter((event) => event.kind === 'message_appended').length,
    2
  );
});
