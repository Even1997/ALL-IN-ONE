import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const loadGateway = async () =>
  import(`../../src/modules/ai/runtime/conversation/runtimeConversationGateway.ts?test=${Date.now()}`);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gatewayHookPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts',
);

test('runtime conversation gateway reconciles runtime threads with chat sessions', async () => {
  const { reconcileRuntimeThreadsWithSessions } = await loadGateway();

  const sessions = [
    {
      id: 'session-1',
      projectId: 'project-1',
      title: 'Existing session',
      providerId: 'built-in',
      runtimeThreadId: null,
      messages: [],
      replayEvents: [],
      recoveryState: null,
      eventLog: [],
      createdAt: 10,
      updatedAt: 10,
    },
  ];
  const runtimeThreads = [
    {
      id: 'runtime-thread-1',
      providerId: 'codex',
      title: 'Runtime thread',
      createdAt: 20,
      updatedAt: 25,
    },
  ];

  const result = reconcileRuntimeThreadsWithSessions({
    projectId: 'project-1',
    sessions,
    runtimeThreads,
  });

  assert.equal(result.sessions.length, 2);
  assert.equal(result.sessions.some((session) => session.runtimeThreadId === 'runtime-thread-1'), true);
});

test('runtime conversation gateway resolves active conversation and thread routes', async () => {
  const { resolveActiveConversationSelection, buildRuntimeConversationProjection } = await loadGateway();

  const sessions = [
    {
      id: 'session-1',
      projectId: 'project-1',
      title: 'First',
      providerId: 'built-in',
      runtimeThreadId: null,
      messages: [{ id: 'msg-1', role: 'user', content: 'hello', createdAt: 10 }],
      replayEvents: [],
      recoveryState: null,
      eventLog: [],
      createdAt: 10,
      updatedAt: 10,
    },
    {
      id: 'session-2',
      projectId: 'project-1',
      title: 'Second',
      providerId: 'codex',
      runtimeThreadId: 'runtime-thread-2',
      messages: [{ id: 'msg-2', role: 'assistant', timeline: [], createdAt: 11 }],
      replayEvents: [],
      recoveryState: null,
      eventLog: [],
      createdAt: 11,
      updatedAt: 11,
    },
  ];

  const selection = resolveActiveConversationSelection({
    sessions,
    activeSessionId: 'session-2',
  });
  assert.equal(selection.activeSession?.id, 'session-2');

  const projection = buildRuntimeConversationProjection({
    sessions,
    activeSessionId: 'session-2',
    activityEntries: [{ id: 'activity-1', type: 'run', summary: 'done', createdAt: 20 }],
    runtimeState: {
      latestTurnSession: { id: 'turn-1', status: 'running' },
      replayResumeRequest: { threadId: 'session-2', prompt: 'retry', resumeKind: 'resume-latest-prompt' },
      liveState: { statusVerb: 'Running', connectionState: 'connected' },
      backgroundTasks: [{ id: 'task-1', threadId: 'session-2', status: 'running' }],
      activeSkills: [{ id: 'requirements', name: 'Requirements', prompt: 'spec first' }],
      contextSnapshot: { prompt: 'ctx' },
      toolCalls: [{ id: 'tool-1', name: 'view', status: 'running' }],
      mcpToolCalls: [{ id: 'mcp-1', serverId: 'goodnight', toolName: 'list' }],
      memoryCandidates: [
        {
          id: 'memory-1',
          threadId: 'session-2',
          title: 'Preference',
          summary: 'brief',
          content: 'brief',
          kind: 'userPreference',
          status: 'pending',
          createdAt: 20,
        },
      ],
      memoryEntries: [
        {
          id: 'entry-1',
          threadId: null,
          label: 'Project fact',
          content: 'use runtime gateway',
          createdAt: 20,
        },
      ],
      teamRuns: [],
    },
    pendingApprovals: [{ id: 'approval-1', status: 'pending' }],
  });

  assert.equal(projection.activeSession?.id, 'session-2');
  assert.equal(projection.approvalThreadId, 'runtime-thread-2');
  assert.equal(projection.checkpointThreadId, 'runtime-thread-2');
  assert.equal(projection.taskThreadId, 'runtime-thread-2');
  assert.equal(projection.liveThreadId, 'session-2');
  assert.equal(projection.pendingApprovalCount, 1);
  assert.equal(projection.messages.length, 1);
});

test('runtime conversation gateway keeps active thread ids stable across focused hooks', async () => {
  const source = await readFile(gatewayHookPath, 'utf8');

  assert.match(source, /const useActiveConversationBase =/);
  assert.match(source, /approvalThreadId:/);
  assert.match(source, /liveThreadId:/);
  assert.match(source, /taskThreadId:/);
});

test('runtime conversation gateway clears stale runtime thread bindings missing from persistence', async () => {
  const { reconcileRuntimeThreadsWithSessions } = await loadGateway();

  const sessions = [
    {
      id: 'session-stale',
      projectId: 'project-1',
      title: 'Stale session',
      providerId: 'codex',
      runtimeThreadId: 'thread-missing',
      messages: [],
      replayEvents: [],
      recoveryState: null,
      eventLog: [],
      createdAt: 10,
      updatedAt: 10,
    },
  ];

  const result = reconcileRuntimeThreadsWithSessions({
    projectId: 'project-1',
    sessions,
    runtimeThreads: [],
  });

  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].id, 'session-stale');
  assert.equal(result.sessions[0].runtimeThreadId, null);
});

test('runtime conversation gateway does not auto-create a welcome session during bootstrap', async () => {
  const { resolveRuntimeConversationBootstrapAction } = await loadGateway();

  const firstAttempt = resolveRuntimeConversationBootstrapAction({
    sessions: [],
    persistedThreadCount: 0,
    activeSessionId: null,
    welcomeSessionBootstrapAttempted: false,
  });
  const secondAttempt = resolveRuntimeConversationBootstrapAction({
    sessions: [],
    persistedThreadCount: 0,
    activeSessionId: null,
    welcomeSessionBootstrapAttempted: true,
  });

  assert.deepEqual(firstAttempt, { type: 'noop' });
  assert.deepEqual(secondAttempt, { type: 'noop' });
});

test('runtime conversation gateway activates the first session instead of creating a duplicate welcome session', async () => {
  const { resolveRuntimeConversationBootstrapAction } = await loadGateway();

  const action = resolveRuntimeConversationBootstrapAction({
    sessions: [
      {
        id: 'session-existing',
        projectId: 'project-1',
        title: 'Existing session',
        providerId: 'built-in',
        runtimeThreadId: null,
        messages: [],
        replayEvents: [],
        recoveryState: null,
        eventLog: [],
        createdAt: 10,
        updatedAt: 10,
      },
    ],
    persistedThreadCount: 0,
    activeSessionId: null,
    welcomeSessionBootstrapAttempted: false,
  });

  assert.deepEqual(action, {
    type: 'select-existing-session',
    sessionId: 'session-existing',
  });
});

test('runtime conversation gateway collapses duplicate chat sessions bound to the same runtime thread', async () => {
  const { reconcileRuntimeThreadsWithSessions } = await loadGateway();

  const result = reconcileRuntimeThreadsWithSessions({
    projectId: 'project-1',
    sessions: [
      {
        id: 'session-older',
        projectId: 'project-1',
        title: '新对话',
        providerId: 'built-in',
        runtimeThreadId: 'thread-1',
        messages: [],
        replayEvents: [],
        recoveryState: null,
        eventLog: [],
        createdAt: 10,
        updatedAt: 10,
      },
      {
        id: 'session-newer',
        projectId: 'project-1',
        title: '新对话',
        providerId: 'built-in',
        runtimeThreadId: 'thread-1',
        messages: [{ id: 'msg-1', role: 'user', content: 'hello', createdAt: 11 }],
        replayEvents: [],
        recoveryState: null,
        eventLog: [],
        createdAt: 11,
        updatedAt: 12,
      },
    ],
    runtimeThreads: [
      {
        id: 'thread-1',
        providerId: 'built-in',
        title: '新对话',
        createdAt: 10,
        updatedAt: 12,
      },
    ],
  });

  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].id, 'session-newer');
  assert.equal(result.sessions[0].runtimeThreadId, 'thread-1');
  assert.deepEqual(result.removedSessionIds, ['session-older']);
});

test('runtime conversation gateway collapses duplicate placeholder welcome sessions', async () => {
  const { reconcileRuntimeThreadsWithSessions } = await loadGateway();

  const result = reconcileRuntimeThreadsWithSessions({
    projectId: 'project-1',
    sessions: [
      {
        id: 'session-placeholder-1',
        projectId: 'project-1',
        title: '新对话',
        providerId: 'built-in',
        runtimeThreadId: null,
        messages: [{ id: 'msg-1', role: 'assistant', timeline: [], createdAt: 10 }],
        replayEvents: [],
        recoveryState: null,
        eventLog: [],
        createdAt: 10,
        updatedAt: 10,
      },
      {
        id: 'session-placeholder-2',
        projectId: 'project-1',
        title: '新对话',
        providerId: 'built-in',
        runtimeThreadId: null,
        messages: [{ id: 'msg-2', role: 'assistant', timeline: [], createdAt: 11 }],
        replayEvents: [],
        recoveryState: null,
        eventLog: [],
        createdAt: 11,
        updatedAt: 11,
      },
    ],
    runtimeThreads: [],
  });

  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].id, 'session-placeholder-2');
  assert.deepEqual(result.removedSessionIds, ['session-placeholder-1']);
});

test('runtime conversation gateway removes legacy empty draft sessions on bootstrap', async () => {
  const { reconcileRuntimeThreadsWithSessions } = await loadGateway();

  const result = reconcileRuntimeThreadsWithSessions({
    projectId: 'project-1',
    sessions: [
      {
        id: 'session-empty-1',
        projectId: 'project-1',
        title: '新对话',
        providerId: 'built-in',
        runtimeThreadId: null,
        messages: [],
        replayEvents: [],
        recoveryState: null,
        eventLog: [],
        createdAt: 10,
        updatedAt: 10,
      },
      {
        id: 'session-empty-2',
        projectId: 'project-1',
        title: '新对话',
        providerId: 'built-in',
        runtimeThreadId: null,
        messages: [],
        replayEvents: [],
        recoveryState: null,
        eventLog: [],
        createdAt: 11,
        updatedAt: 11,
      },
      {
        id: 'session-empty-3',
        projectId: 'project-1',
        title: '新对话',
        providerId: 'built-in',
        runtimeThreadId: null,
        messages: [],
        replayEvents: [],
        recoveryState: null,
        eventLog: [],
        createdAt: 12,
        updatedAt: 12,
      },
    ],
    runtimeThreads: [],
  });

  assert.equal(result.sessions.length, 0);
  assert.deepEqual(result.removedSessionIds, [
    'session-empty-1',
    'session-empty-2',
    'session-empty-3',
  ]);
});

test('runtime conversation gateway removes empty sessions after stale runtime thread bindings are cleared', async () => {
  const { reconcileRuntimeThreadsWithSessions } = await loadGateway();

  const result = reconcileRuntimeThreadsWithSessions({
    projectId: 'project-1',
    sessions: [
      {
        id: 'session-stale-empty',
        projectId: 'project-1',
        title: '新对话',
        providerId: 'built-in',
        runtimeThreadId: 'thread-pruned',
        messages: [],
        replayEvents: [],
        recoveryState: null,
        eventLog: [],
        createdAt: 10,
        updatedAt: 10,
      },
    ],
    runtimeThreads: [],
  });

  assert.equal(result.sessions.length, 0);
  assert.deepEqual(result.removedSessionIds, ['session-stale-empty']);
});

test('runtime conversation gateway ignores legacy empty runtime threads from persistence', async () => {
  const { reconcileRuntimeThreadsWithSessions } = await loadGateway();

  const result = reconcileRuntimeThreadsWithSessions({
    projectId: 'project-1',
    sessions: [],
    runtimeThreads: [
      {
        id: 'thread-empty',
        providerId: 'built-in',
        title: '新对话',
        createdAt: 10,
        updatedAt: 10,
      },
    ],
  });

  assert.equal(result.sessions.length, 0);
  assert.equal(result.bindings.length, 0);
});
