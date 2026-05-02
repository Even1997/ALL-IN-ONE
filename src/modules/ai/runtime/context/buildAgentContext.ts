import { estimateTextTokens } from '../../chat/contextBudget.ts';
import { buildConversationHistorySection } from '../../chat/directChatPrompt.ts';
import { buildRuntimeSkillPrompt } from '../skills/buildRuntimeSkillPrompt.ts';
import { allocateContextBudget, createContextSection } from './contextBudgetAllocator.ts';
import type {
  AgentContextBudget,
  AgentContextBuildInput,
  AgentContextSection,
  AgentContextSnapshot,
} from './agentContextTypes.ts';

const renderSection = (section: AgentContextSection) =>
  `<${section.kind} title="${section.title}" source="${section.sourceLabel}">\n${section.content}\n</${section.kind}>`;

const buildMemoryContent = (input: AgentContextBuildInput) =>
  input.memoryEntries.map((entry) => `${entry.label}: ${entry.content}`).join('\n');

const buildReferenceContent = (input: AgentContextBuildInput) =>
  input.referenceFiles
    .map((file) => [file.path, file.summary, file.content].filter(Boolean).join('\n'))
    .join('\n\n');

const buildActiveContextContent = (input: AgentContextBuildInput) =>
  [`project: ${input.projectName}`, `project_id: ${input.projectId}`, `thread_id: ${input.threadId}`].join('\n');

const buildContextReport = (sections: AgentContextSection[], budget: AgentContextSnapshot['budget']) => {
  const formatList = (items: AgentContextSection[]) =>
    items.length > 0
      ? items.map((section) => `- ${section.kind}:${section.id} (${section.estimatedTokens})`).join('\n')
      : '- none';

  return [
    '<context_report>',
    `used_tokens: ${budget.usedTokens}`,
    `limit_tokens: ${budget.limitTokens}`,
    'included:',
    formatList(sections.filter((section) => section.included)),
    'excluded:',
    formatList(sections.filter((section) => !section.included)),
    '</context_report>',
  ].join('\n');
};

const buildPrompt = (sections: AgentContextSection[], budget: AgentContextBudget) => {
  const promptSections = sections.filter((section) => section.included).map(renderSection);

  return [...promptSections, buildContextReport(sections, budget)].join('\n\n');
};

const finalizeBudget = (limitTokens: number, prompt: string): AgentContextBudget => {
  const usedTokens = estimateTextTokens(prompt);

  return {
    limitTokens,
    usedTokens,
    remainingTokens: Math.max(0, limitTokens - usedTokens),
  };
};

const buildPromptAndBudget = (
  sections: AgentContextSection[],
  initialBudget: AgentContextBudget
): { prompt: string; budget: AgentContextBudget } => {
  let budget = initialBudget;
  let prompt = buildPrompt(sections, budget);

  for (let index = 0; index < 8; index += 1) {
    const nextBudget = finalizeBudget(budget.limitTokens, prompt);
    const nextPrompt = buildPrompt(sections, nextBudget);

    budget = nextBudget;
    prompt = nextPrompt;

    if (estimateTextTokens(prompt) === budget.usedTokens) {
      break;
    }
  }

  return { prompt, budget };
};

export const buildAgentContext = (input: AgentContextBuildInput): AgentContextSnapshot => {
  const sections = [
    createContextSection({
      id: 'instructions',
      kind: 'instructions',
      title: 'Instructions',
      sourceLabel: 'instructions',
      content: input.instructions.join('\n\n'),
    }),
    createContextSection({
      id: 'skills',
      kind: 'skills',
      title: 'Active Skills',
      sourceLabel: 'runtime skills',
      content: buildRuntimeSkillPrompt(input.activeSkills),
    }),
    createContextSection({
      id: 'history',
      kind: 'history',
      title: 'Recent History',
      sourceLabel: 'conversation history',
      content: buildConversationHistorySection(input.conversationHistory),
    }),
    createContextSection({
      id: 'memory',
      kind: 'memory',
      title: 'Memory',
      sourceLabel: 'memory store',
      content: buildMemoryContent(input),
    }),
    createContextSection({
      id: 'reference',
      kind: 'reference',
      title: 'References',
      sourceLabel: 'reference files',
      content: buildReferenceContent(input),
    }),
    createContextSection({
      id: 'active-context',
      kind: 'active-context',
      title: 'Active Context',
      sourceLabel: 'runtime context',
      content: buildActiveContextContent(input),
    }),
    createContextSection({
      id: 'user-input',
      kind: 'user-input',
      title: 'User Input',
      sourceLabel: 'user',
      content: input.userInput.trim(),
    }),
  ].filter((section) => section.content.trim().length > 0);

  const requiredSectionIds = sections
    .filter((section) => section.kind === 'instructions' || section.kind === 'user-input')
    .map((section) => section.id);
  const allocated = allocateContextBudget(sections, input.contextWindowTokens, {
    requiredSectionIds,
    estimateIncludedBudget: (candidateSections, budget) => buildPromptAndBudget(candidateSections, budget).budget,
  });
  const prompt = buildPromptAndBudget(allocated.sections, allocated.budget).prompt;

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    threadId: input.threadId,
    sections: allocated.sections,
    budget: allocated.budget,
    prompt,
  };
};
