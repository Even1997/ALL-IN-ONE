import assert from 'node:assert/strict';
import test from 'node:test';

const loadModule = async () =>
  import(`../../src/modules/ai/runtime/orchestration/runtimeBuiltInToolApproval.ts?test=${Date.now()}`);

test('built-in tool approval blocks high-risk tools when sandbox policy is deny', async () => {
  const { requestBuiltInToolApproval } = await loadModule();

  await assert.rejects(
    () =>
      requestBuiltInToolApproval({
        call: {
          id: 'call-1',
          name: 'bash',
          input: { command: 'echo hi' },
        },
        sandboxPolicy: 'deny',
        runtimeThreadId: 'thread-1',
        targetSessionId: 'session-1',
        runtimeStoreThreadId: 'runtime-1',
        replayThreadId: 'replay-1',
        runtimeProviderId: 'built-in',
        assistantMessageId: 'message-1',
        interactionPort: {
          waitForApproval: async () => true,
        },
        buildBuiltInToolApprovalActionType: () => 'tool_bash',
        buildBuiltInToolApprovalSummary: () => 'Run shell command',
        buildBuiltInToolApprovalDisplay: () => ({ toolName: 'bash' }),
      }),
    /blocks bash/i,
  );
});

test('built-in tool approval waits for approval and forwards toolCallId for risky tools', async () => {
  const { requestBuiltInToolApproval } = await loadModule();

  const approvalPayloads = [];

  await requestBuiltInToolApproval({
    call: {
      id: 'call-2',
      name: 'bash',
      input: { command: 'echo hi' },
    },
    sandboxPolicy: 'ask',
    runtimeThreadId: 'thread-2',
    targetSessionId: 'session-2',
    runtimeStoreThreadId: 'runtime-2',
    replayThreadId: 'replay-2',
    runtimeProviderId: 'built-in',
    assistantMessageId: 'message-2',
    interactionPort: {
      waitForApproval: async (payload) => {
        approvalPayloads.push(payload);
        return true;
      },
    },
    buildBuiltInToolApprovalActionType: () => 'tool_bash',
    buildBuiltInToolApprovalSummary: () => 'Run shell command',
    buildBuiltInToolApprovalDisplay: () => ({ toolName: 'bash' }),
  });

  assert.deepEqual(approvalPayloads, [
    {
      threadId: 'thread-2',
      runtimeStoreThreadId: 'runtime-2',
      replayThreadId: 'replay-2',
      providerId: 'built-in',
      actionType: 'tool_bash',
      riskLevel: 'high',
      summary: 'Run shell command',
      messageId: 'message-2',
      toolCallId: 'call-2',
      display: { toolName: 'bash' },
      onApprove: approvalPayloads[0]?.onApprove,
      onDeny: approvalPayloads[0]?.onDeny,
    },
  ]);
  assert.equal(typeof approvalPayloads[0]?.onApprove, 'function');
  assert.equal(typeof approvalPayloads[0]?.onDeny, 'function');
});

test('built-in tool approval rejects when the user denies the risky tool', async () => {
  const { requestBuiltInToolApproval } = await loadModule();

  await assert.rejects(
    () =>
      requestBuiltInToolApproval({
        call: {
          id: 'call-3',
          name: 'bash',
          input: { command: 'echo hi' },
        },
        sandboxPolicy: 'ask',
        runtimeThreadId: 'thread-3',
        targetSessionId: 'session-3',
        runtimeStoreThreadId: 'runtime-3',
        replayThreadId: 'replay-3',
        runtimeProviderId: 'built-in',
        assistantMessageId: 'message-3',
        interactionPort: {
          waitForApproval: async () => false,
        },
        buildBuiltInToolApprovalActionType: () => 'tool_bash',
        buildBuiltInToolApprovalSummary: () => 'Run shell command',
        buildBuiltInToolApprovalDisplay: () => ({ toolName: 'bash' }),
      }),
    /User denied bash/i,
  );
});

test('built-in tool approval auto-approves low-risk tools without calling approval UI', async () => {
  const { requestBuiltInToolApproval } = await loadModule();

  let approvalRequests = 0;

  await requestBuiltInToolApproval({
    call: {
      id: 'call-4',
      name: 'view',
      input: { file_path: 'src/app.ts' },
    },
    sandboxPolicy: 'ask',
    runtimeThreadId: 'thread-4',
    targetSessionId: 'session-4',
    runtimeStoreThreadId: 'runtime-4',
    replayThreadId: 'replay-4',
    runtimeProviderId: 'built-in',
    assistantMessageId: 'message-4',
    interactionPort: {
      waitForApproval: async () => {
        approvalRequests += 1;
        return true;
      },
    },
    buildBuiltInToolApprovalActionType: () => 'tool_read',
    buildBuiltInToolApprovalSummary: () => 'Read file',
    buildBuiltInToolApprovalDisplay: () => ({ toolName: 'view' }),
  });

  assert.equal(approvalRequests, 0);
});
