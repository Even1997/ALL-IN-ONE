// 文件作用：抽离内建工具审批闸门，位于 runtime orchestration 层。
// 所在链路：built-in tool call -> 风险判定 -> sandbox / approval gate -> 继续执行或阻断。
// 排查入口：若内建工具在 structured tool path 下出现“未审批直接执行”或“拒绝后仍继续”，先看这里。

import type { SandboxPolicy } from '../approval/approvalTypes.ts';
import { classifyRuntimeActionRisk, shouldAutoApproveRuntimeAction, shouldDenyRuntimeAction } from '../approval/riskPolicy.ts';
import type { ToolCall } from '../tools/toolExecutor.ts';

export const requestBuiltInToolApproval = async (input: {
  call: ToolCall;
  sandboxPolicy: SandboxPolicy;
  runtimeThreadId: string | null;
  targetSessionId: string;
  runtimeStoreThreadId: string;
  replayThreadId: string;
  runtimeProviderId: string;
  assistantMessageId: string;
  interactionPort: {
    waitForApproval: (payload: {
      threadId: string;
      runtimeStoreThreadId: string;
      replayThreadId: string;
      providerId: string;
      actionType: string;
      riskLevel: 'low' | 'medium' | 'high';
      summary: string;
      messageId: string;
      toolCallId: string;
      display: {
        toolName?: string | null;
        command?: string | null;
        filePath?: string | null;
        oldString?: string | null;
        newString?: string | null;
        content?: string | null;
        inputJson?: string | null;
      };
      onApprove: () => Promise<void>;
      onDeny: () => Promise<void>;
    }) => Promise<boolean>;
  };
  buildBuiltInToolApprovalActionType: (toolName: string) => string;
  buildBuiltInToolApprovalSummary: (toolName: string, toolInput: Record<string, unknown>) => string;
  buildBuiltInToolApprovalDisplay: (toolName: string, toolInput: Record<string, unknown>) => {
    toolName?: string | null;
    command?: string | null;
    filePath?: string | null;
    oldString?: string | null;
    newString?: string | null;
    content?: string | null;
    inputJson?: string | null;
  };
}) => {
  const actionType = input.buildBuiltInToolApprovalActionType(input.call.name);
  const riskLevel = classifyRuntimeActionRisk(actionType);

  if (shouldDenyRuntimeAction({ riskLevel, sandboxPolicy: input.sandboxPolicy })) {
    throw new Error(`Current sandbox policy (${input.sandboxPolicy}) blocks ${input.call.name}.`);
  }

  if (shouldAutoApproveRuntimeAction({ riskLevel, sandboxPolicy: input.sandboxPolicy })) {
    return;
  }

  const approved = await input.interactionPort.waitForApproval({
    threadId: input.runtimeThreadId || input.targetSessionId,
    runtimeStoreThreadId: input.runtimeStoreThreadId,
    replayThreadId: input.replayThreadId,
    providerId: input.runtimeProviderId,
    actionType,
    riskLevel,
    summary: input.buildBuiltInToolApprovalSummary(input.call.name, input.call.input),
    messageId: input.assistantMessageId,
    toolCallId: input.call.id,
    display: input.buildBuiltInToolApprovalDisplay(input.call.name, input.call.input),
    // 这里先只锁“审批事实”和“toolCallId 关联”，真正执行回调仍由外层编排控制。
    onApprove: async () => {},
    onDeny: async () => {},
  });

  if (!approved) {
    throw new Error(`User denied ${input.call.name}.`);
  }
};
