import assert from 'node:assert/strict';
import test from 'node:test';

const loadCoordinator = async () =>
  import(`../../src/modules/ai/runtime/orchestration/runtimeApprovalCoordinator.ts?test=${Date.now()}`);

test('runtime approval coordinator registers pending actions and resolves them through frontend/backend stores', async () => {
  const { requestRuntimeApproval, resolveRuntimeApproval } = await loadCoordinator();

  const pendingApprovalActions = {};
  const frontendApprovals = [];
  const backendResolutions = [];
  const localResolutions = [];

  const approval = await requestRuntimeApproval({
    threadId: 'thread-1',
    actionType: 'tool_edit',
    riskLevel: 'medium',
    summary: 'Edit file',
    messageId: 'message-1',
    onApprove: async () => undefined,
    onDeny: async () => undefined,
    enqueueAgentApproval: async (payload) => ({
      id: 'approval-1',
      threadId: payload.threadId,
      actionType: payload.actionType,
      riskLevel: payload.riskLevel,
      summary: payload.summary,
      status: 'pending',
      createdAt: 1,
      messageId: payload.messageId,
    }),
    enqueueApproval: (record) => {
      frontendApprovals.push(record);
    },
    pendingApprovalActions,
  });

  assert.equal(approval.id, 'approval-1');
  assert.equal(typeof pendingApprovalActions['approval-1']?.onApprove, 'function');
  assert.equal(frontendApprovals.length, 1);

  const pendingAction = await resolveRuntimeApproval({
    approvalId: 'approval-1',
    status: 'approved',
    pendingApprovalActions,
    resolveStoredApproval: (approvalId, status) => {
      localResolutions.push({ approvalId, status });
    },
    resolveAgentApproval: async (payload) => {
      backendResolutions.push(payload);
    },
  });

  assert.equal(typeof pendingAction?.onApprove, 'function');
  assert.deepEqual(localResolutions, [{ approvalId: 'approval-1', status: 'approved' }]);
  assert.deepEqual(backendResolutions, [{ approvalId: 'approval-1', status: 'approved' }]);
  assert.equal('approval-1' in pendingApprovalActions, false);
});
