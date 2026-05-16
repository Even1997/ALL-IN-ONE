// 文件作用：模块实现文件，位于session 生命周期层。
// 所在链路：负责 turn session 的模式判定、状态迁移与只读查询。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件负责根据输入特征决定 turn 走 direct 还是 plan_then_execute，并生成审批继续动作，是 session 控制层。
// 它比状态机更偏“策略决策”，但又比 coordinator 更轻，专门放这类可复用的判定与 continuation 拼装逻辑。
// 如果你在排查“为什么这一轮突然进计划模式 / 为什么批准后会继续执行”，先从这里看判定规则。
import type { RuntimePendingApprovalAction } from '../orchestration/runtimeApprovalCoordinator.ts';
import type { AgentTurnSessionMode } from './agentSessionTypes';

export const decideAgentTurnMode = (input: {
  prompt: string;
  suggestedPlanMode: boolean;
  riskyWriteDetected: boolean;
  bashDetected: boolean;
  multiStepDetected: boolean;
}): {
  mode: AgentTurnSessionMode;
  reason: 'risk-rule' | 'complexity' | 'direct';
} => {
  // 风险和 bash 检测优先级最高，只要命中就强制走 plan_then_execute，
  // 避免把潜在危险动作直接落到无确认执行路径。
  if (input.riskyWriteDetected || input.bashDetected) {
    return {
      mode: 'plan_then_execute',
      reason: 'risk-rule',
    };
  }

  if (input.suggestedPlanMode || input.multiStepDetected) {
    return {
      mode: 'plan_then_execute',
      reason: 'complexity',
    };
  }

  return {
    mode: 'direct',
    reason: 'direct',
  };
};

export const buildPlanApprovalContinuation = (input: {
  onApprovedExecute: () => Promise<void>;
  onDeniedBlock: () => Promise<void>;
}): RuntimePendingApprovalAction => ({
  onApprove: input.onApprovedExecute,
  onDeny: input.onDeniedBlock,
});
