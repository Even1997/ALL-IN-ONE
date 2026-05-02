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
