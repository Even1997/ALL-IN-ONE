// 文件作用：模块实现文件，位于memory 作用域层。
// 所在链路：负责把记忆按项目或线程作用域整理成统一结构。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件负责构建项目级 memory entry，是 runtime memory 的“项目作用域适配层”。
// 它把项目事实和用户偏好整理成统一 AgentMemoryEntry 结构，供后续上下文检索和 prompt 注入复用。
// 如果你在排查“某条项目记忆为什么没有 threadId / 为什么被标成 projectFact 或 userPreference”，先看这里。
import type { AgentMemoryEntry } from '../agentRuntimeTypes';

export const buildProjectMemoryEntry = (input: {
  id: string;
  threadId?: string | null;
  title: string;
  summary: string;
  content: string;
  kind: 'projectFact' | 'userPreference';
  updatedAt: number;
}): AgentMemoryEntry => ({
  id: input.id,
  threadId: input.threadId || null,
  label: input.kind,
  title: input.title,
  summary: input.summary,
  content: input.content,
  createdAt: input.updatedAt,
  updatedAt: input.updatedAt,
  kind: input.kind,
});
