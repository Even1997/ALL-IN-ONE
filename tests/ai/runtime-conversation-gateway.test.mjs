import assert from 'node:assert/strict';
import test from 'node:test';

const loadGateway = async () =>
  import(`../../src/modules/ai/runtime/conversation/runtimeConversationGateway.ts?test=${Date.now()}`);

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
