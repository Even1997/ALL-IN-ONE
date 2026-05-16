// 文件作用：类型契约文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { AgentMemoryEntry, AgentReferenceFile } from '../agentRuntimeTypes.ts';
import type { RuntimeSkillDefinition } from '../skills/runtimeSkillTypes.ts';

export type AgentContextSectionKind =
  | 'instructions'
  | 'skills'
  | 'history'
  | 'memory'
  | 'reference'
  | 'active-context'
  | 'user-input';

export type AgentContextSection = {
  id: string;
  kind: AgentContextSectionKind;
  title: string;
  content: string;
  sourceLabel: string;
  estimatedTokens: number;
  included: boolean;
};

export type AgentContextBudget = {
  limitTokens: number;
  usedTokens: number;
  remainingTokens: number;
  overflow?: boolean;
};

export type AgentContextConversationMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type AgentContextBuildInput = {
  projectId: string;
  projectName: string;
  threadId: string;
  userInput: string;
  contextWindowTokens: number;
  conversationHistory: AgentContextConversationMessage[];
  instructions: string[];
  referenceFiles: AgentReferenceFile[];
  memoryEntries: AgentMemoryEntry[];
  activeSkills: RuntimeSkillDefinition[];
};

export type AgentContextSnapshot = {
  projectId: string;
  projectName: string;
  threadId: string;
  sections: AgentContextSection[];
  budget: AgentContextBudget;
  prompt: string;
};
