// 文件作用：只读选择器，位于session 生命周期层。
// 所在链路：负责 turn session 的模式判定、状态迁移与只读查询。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件放的是 agent session 的只读选择器，属于 session store 旁边的轻量派生层。
// 它刻意避免写入逻辑和展示规则，只做“从一组 session 中挑出要读哪一个”这种稳定查询。
// 如果你在排查“界面读错了当前 session / 最新 turn 没被选中”，先看这里的选择规则。
import type { AgentTurnSession } from './agentSessionTypes';

// selector 层刻意保持很薄，只做“从一组 session 里挑哪个”这类只读逻辑，
// 避免把展示规则和状态写回逻辑混进 session store。
export const getLatestTurnSession = (
  sessions: AgentTurnSession[] | null | undefined,
): AgentTurnSession | null => {
  if (!sessions || sessions.length === 0) {
    return null;
  }

  return sessions[sessions.length - 1] || null;
};
