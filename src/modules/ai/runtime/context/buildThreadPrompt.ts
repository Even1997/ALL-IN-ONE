import type { AgentContextBundle } from '../agentRuntimeTypes';
import { buildRuntimeSkillPrompt } from '../skills/buildRuntimeSkillPrompt.ts';

const buildMemorySection = (context: AgentContextBundle) => {
  if (context.memoryEntries.length === 0) {
    return null;
  }

  return `<memory>\n${context.memoryEntries
    .map((item) => `${item.label}: ${item.content}`)
    .join('\n')}\n</memory>`;
};

const buildReferenceSection = (context: AgentContextBundle) => {
  if (context.referenceFiles.length === 0) {
    return null;
  }

  return `<references>\n${context.referenceFiles
    .map((item) => `${item.path}\n${item.content}`)
    .join('\n\n')}\n</references>`;
};

const buildSkillSection = (context: AgentContextBundle) => {
  if (context.activeSkills.length === 0) {
    return null;
  }

  return `<skills>\n${buildRuntimeSkillPrompt(context.activeSkills)}\n</skills>`;
};

export const buildThreadPrompt = (context: AgentContextBundle, userInput: string) =>
  [
    context.instructions.length > 0
      ? `<instructions>\n${context.instructions.join('\n\n')}\n</instructions>`
      : null,
    buildSkillSection(context),
    buildMemorySection(context),
    buildReferenceSection(context),
    userInput.trim(),
  ]
    .filter((item): item is string => Boolean(item))
    .join('\n\n');
