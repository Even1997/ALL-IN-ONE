import assert from 'node:assert/strict';
import test from 'node:test';

const loadController = async () =>
  import(`../../src/modules/ai/runtime/session/agentSessionController.ts?test=${Date.now()}`);

test('session controller forces plan mode for risky file-and-command work', async () => {
  const { decideAgentTurnMode } = await loadController();

  const result = decideAgentTurnMode({
    prompt: 'edit src/App.tsx, package.json, then run npm test',
    suggestedPlanMode: false,
    riskyWriteDetected: true,
    bashDetected: true,
    multiStepDetected: true,
  });

  assert.equal(result.mode, 'plan_then_execute');
  assert.equal(result.reason, 'risk-rule');
});

test('session controller returns direct mode for simple requests', async () => {
  const { decideAgentTurnMode } = await loadController();

  const result = decideAgentTurnMode({
    prompt: 'summarize the latest error',
    suggestedPlanMode: false,
    riskyWriteDetected: false,
    bashDetected: false,
    multiStepDetected: false,
  });

  assert.equal(result.mode, 'direct');
  assert.equal(result.reason, 'direct');
});

test('session controller builds approval continuations without wrapping callbacks', async () => {
  const { buildPlanApprovalContinuation } = await loadController();
  const onApprovedExecute = async () => undefined;
  const onDeniedBlock = async () => undefined;

  const continuation = buildPlanApprovalContinuation({
    onApprovedExecute,
    onDeniedBlock,
  });

  assert.equal(continuation.onApprove, onApprovedExecute);
  assert.equal(continuation.onDeny, onDeniedBlock);
});
