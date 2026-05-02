import assert from 'node:assert/strict';
import test from 'node:test';

const loadApprovalStore = async () =>
  import(`../../src/modules/ai/runtime/approval/approvalStore.ts?test=${Date.now()}`);

test('approval store tracks pending decisions per thread and updates approval status', async () => {
  const { useApprovalStore } = await loadApprovalStore();
  const store = useApprovalStore.getState();

  store.enqueueApproval({
    id: 'approval-1',
    threadId: 'thread-1',
    actionType: 'tool_remove',
    riskLevel: 'high',
    summary: 'Delete docs/spec.md',
    status: 'pending',
    createdAt: 1,
  });
  store.resolveApproval('approval-1', 'approved');

  const approval = useApprovalStore.getState().approvalsByThread['thread-1'][0];
  assert.equal(approval.status, 'approved');
});

test('approval store keeps sandbox policy for runtime gating', async () => {
  const { useApprovalStore } = await loadApprovalStore();
  useApprovalStore.getState().setSandboxPolicy('deny');

  assert.equal(useApprovalStore.getState().sandboxPolicy, 'deny');
});
