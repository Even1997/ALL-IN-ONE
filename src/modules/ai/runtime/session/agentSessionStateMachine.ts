// 文件作用：状态机规则层，位于session 生命周期层。
// 所在链路：负责 turn session 的模式判定、状态迁移与只读查询。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件定义 agent turn session 的状态机 reducer，是 session 生命周期演进的唯一规则入口。
// 它不关心 UI 长什么样，也不直接发请求，只负责根据事件把 session 从一种状态推进到下一种状态。
// 如果你在排查“某个 session 为什么没从 planning 进入 executing / blocked 后为何变成 resumable”，优先看这里的状态迁移。
import type { AgentTurnSession } from './agentSessionTypes';

export type AgentTurnSessionEvent =
  | { type: 'start_classifying' }
  | { type: 'enter_planning' }
  | { type: 'plan_waiting_approval' }
  | { type: 'approval_granted' }
  | { type: 'execution_blocked'; reason: string; actionLabel: string | null }
  | { type: 'execution_completed' }
  | { type: 'execution_failed'; reason: string };

export const reduceAgentTurnSession = (
  session: AgentTurnSession,
  event: AgentTurnSessionEvent,
): AgentTurnSession => {
  const updatedAt = Date.now();

  switch (event.type) {
    case 'start_classifying':
      return {
        ...session,
        status: 'classifying',
        updatedAt,
      };
    case 'enter_planning':
      return {
        ...session,
        mode: 'plan_then_execute',
        status: 'planning',
        updatedAt,
      };
    case 'plan_waiting_approval':
      return {
        ...session,
        status: 'waiting_approval',
        updatedAt,
      };
    case 'approval_granted':
      return {
        ...session,
        status: 'executing',
        resumeSnapshot: null,
        updatedAt,
      };
    case 'execution_blocked':
      // 被阻塞时不把会话标成失败，而是保留 resumeSnapshot，
      // 让用户在补充条件或完成审批后还能继续这轮执行。
      return {
        ...session,
        status: 'resumable',
        resumeSnapshot: {
          turnId: session.id,
          resumeFromStepId: null,
          resumeReason: event.reason,
          blockingRequirement: event.reason,
          resumeActionLabel: event.actionLabel,
          lastStableOutput: '',
        },
        updatedAt,
      };
    case 'execution_completed':
      return {
        ...session,
        status: 'completed',
        resumeSnapshot: null,
        updatedAt,
      };
    case 'execution_failed':
      return {
        ...session,
        status: 'failed',
        updatedAt,
      };
  }
};
