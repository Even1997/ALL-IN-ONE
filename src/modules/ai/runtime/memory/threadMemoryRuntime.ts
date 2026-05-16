// 文件作用：模块实现文件，位于memory 作用域层。
// 所在链路：负责把记忆按项目或线程作用域整理成统一结构。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件负责构建线程级 memory entry，是 runtime memory 的“线程作用域适配层”。
// 它和 projectMemoryRuntime 结构相近，但这里明确要求 threadId，表示记忆只在当前会话线程内生效。
// 如果你在排查“某条记忆为什么只属于当前线程 / 为什么没有被提升成项目级记忆”，通常先看这里。
import type { AgentMemoryEntry } from '../agentRuntimeTypes';

export const buildThreadMemoryEntry = (input: {
  id: string;
  threadId: string;
  title: string;
  summary: string;
  content: string;
  kind: 'projectFact' | 'userPreference';
  updatedAt: number;
}): AgentMemoryEntry => ({
  id: input.id,
  threadId: input.threadId,
  label: input.kind,
  title: input.title,
  summary: input.summary,
  content: input.content,
  createdAt: input.updatedAt,
  updatedAt: input.updatedAt,
  kind: input.kind,
});
