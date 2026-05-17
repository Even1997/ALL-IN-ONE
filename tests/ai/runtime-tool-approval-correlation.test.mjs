import assert from 'node:assert/strict';
import test from 'node:test';

const loadCoordinator = async () =>
  import(`../../src/modules/ai/runtime/orchestration/runtimeApprovalCoordinator.ts?test=${Date.now()}`);

test('runtime approval coordinator keeps tool call identity stable across request and resolve', async () => {
  const { requestRuntimeApproval, resolveRuntimeApproval } = await loadCoordinator();

  const pendingApprovalActions = {};
  const requestedApprovals = [];
  const backendResolutions = [];

  const approval = await requestRuntimeApproval({
    threadId: 'thread-1',
    runtimeStoreThreadId: 'session-1',
    replayThreadId: 'thread-1',
    providerId: 'built-in',
    actionType: 'tool_edit',
    riskLevel: 'medium',
    summary: 'Edit file',
    messageId: 'message-1',
    toolCallId: 'tool-call-1',
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
      toolCallId: payload.toolCallId,
    }),
    enqueueApproval: (record) => {
      requestedApprovals.push(record);
    },
    pendingApprovalActions,
  });

  const pendingAction = await resolveRuntimeApproval({
    approvalId: approval.id,
    status: 'approved',
    pendingApprovalActions,
    resolveStoredApproval: () => undefined,
    resolveAgentApproval: async (payload) => {
      backendResolutions.push(payload);
    },
  });

  // 审批恢复时需要能稳定拿回对应 toolCallId，后续执行不能再靠正文猜。
  assert.equal(requestedApprovals[0]?.toolCallId, 'tool-call-1');
  assert.equal(pendingAction?.toolCallId, 'tool-call-1');
  assert.deepEqual(backendResolutions, [
    { approvalId: 'approval-1', status: 'approved', toolCallId: 'tool-call-1' },
  ]);
});
