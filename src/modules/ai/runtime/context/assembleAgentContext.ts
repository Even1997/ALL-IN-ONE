// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { RuntimeSkillDefinition } from '../skills/runtimeSkillTypes';
import type { AgentContextBundle, AgentMemoryEntry, AgentReferenceFile } from '../agentRuntimeTypes';

export const assembleAgentContext = (input: {
  projectId: string | null;
  projectName: string | null;
  threadId: string | null;
  agentsInstructions: string[];
  referenceFiles: AgentReferenceFile[];
  memoryEntries: AgentMemoryEntry[];
  activeSkills?: RuntimeSkillDefinition[];
}): AgentContextBundle => ({
  projectId: input.projectId,
  projectName: input.projectName,
  threadId: input.threadId,
  labels: ['AGENTS.md', ...input.referenceFiles.map((item) => item.path)],
  memoryLabels: input.memoryEntries.map((item) => item.label),
  content: '',
  instructions: input.agentsInstructions,
  referenceFiles: input.referenceFiles,
  memoryEntries: input.memoryEntries,
  activeSkills: input.activeSkills || [],
});
