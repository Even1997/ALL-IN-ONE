import assert from 'node:assert/strict';
import test from 'node:test';

const loadStateMachine = async () =>
  import(`../../src/modules/ai/runtime/session/agentSessionStateMachine.ts?test=${Date.now()}`);

test('session state machine transitions planning to waiting_approval and executing', async () => {
  const { reduceAgentTurnSession } = await loadStateMachine();

  const base = {
    id: 'turn-1',
    threadId: 'thread-1',
    providerId: 'codex',
    userPrompt: 'edit src/App.tsx and run tests',
    status: 'planning',
    mode: 'plan_then_execute',
    plan: null,
    executionSteps: [],
    resumeSnapshot: null,
    createdAt: 1,
    updatedAt: 1,
  };

  const waiting = reduceAgentTurnSession(base, { type: 'plan_waiting_approval' });
  const running = reduceAgentTurnSession(waiting, { type: 'approval_granted' });

  assert.equal(waiting.status, 'waiting_approval');
  assert.equal(running.status, 'executing');
});

test('session state machine records a resumable snapshot when execution is blocked', async () => {
  const { reduceAgentTurnSession } = await loadStateMachine();

  const session = {
    id: 'turn-2',
    threadId: 'thread-1',
    providerId: 'codex',
    userPrompt: 'apply the fix',
    status: 'executing',
    mode: 'plan_then_execute',
    plan: null,
    executionSteps: [],
    resumeSnapshot: null,
    createdAt: 1,
    updatedAt: 1,
  };

  const blocked = reduceAgentTurnSession(session, {
    type: 'execution_blocked',
    reason: 'Needs approval to continue',
    actionLabel: 'Approve and continue',
  });

  assert.equal(blocked.status, 'resumable');
  assert.equal(blocked.resumeSnapshot?.resumeReason, 'Needs approval to continue');
  assert.equal(blocked.resumeSnapshot?.resumeActionLabel, 'Approve and continue');
});

test('session state machine clears stale resume snapshots after approval and completion', async () => {
  const { reduceAgentTurnSession } = await loadStateMachine();

  const blocked = {
    id: 'turn-3',
    threadId: 'thread-1',
    providerId: 'codex',
    userPrompt: 'continue the plan',
    status: 'resumable',
    mode: 'plan_then_execute',
    plan: null,
    executionSteps: [],
    resumeSnapshot: {
      turnId: 'turn-3',
      resumeFromStepId: null,
      resumeReason: 'Waiting on approval',
      blockingRequirement: 'Waiting on approval',
      resumeActionLabel: 'Approve',
      lastStableOutput: '',
    },
    createdAt: 1,
    updatedAt: 1,
  };

  const resumed = reduceAgentTurnSession(blocked, { type: 'approval_granted' });
  const completed = reduceAgentTurnSession(blocked, { type: 'execution_completed' });

  assert.equal(resumed.status, 'executing');
  assert.equal(resumed.resumeSnapshot, null);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.resumeSnapshot, null);
});
