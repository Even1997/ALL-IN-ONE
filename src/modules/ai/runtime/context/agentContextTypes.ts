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
