import { estimateTextTokens } from '../../chat/contextBudget.ts';
import type { AgentContextBudget, AgentContextSection, AgentContextSectionKind } from './agentContextTypes.ts';

type AllocateContextBudgetOptions = {
  requiredSectionIds?: string[];
  estimateIncludedBudget?: (sections: AgentContextSection[], budget: AgentContextBudget) => AgentContextBudget;
};

export const createContextSection = (input: {
  id: string;
  kind: AgentContextSectionKind;
  title: string;
  content: string;
  sourceLabel: string;
}): AgentContextSection => ({
  ...input,
  estimatedTokens: estimateTextTokens(input.content),
  included: false,
});

export const allocateContextBudget = (
  sections: AgentContextSection[],
  limitTokens: number,
  options: AllocateContextBudgetOptions = {}
): { sections: AgentContextSection[]; budget: AgentContextBudget } => {
  const safeLimit = Math.max(0, Math.floor(Number.isFinite(limitTokens) ? limitTokens : 0));
  const requiredIds = new Set(options.requiredSectionIds || []);
  const includedOptionalIds = new Set<string>();
  const initialBudget = {
    limitTokens: safeLimit,
    usedTokens: 0,
    remainingTokens: safeLimit,
  };
  const markIncludedSections = (includedIds: Set<string>) =>
    sections.map((section) => ({
      ...section,
      included: includedIds.has(section.id),
    }));
  const estimateBudget = (includedIds: Set<string>) => {
    const markedSections = markIncludedSections(includedIds);

    if (options.estimateIncludedBudget) {
      return options.estimateIncludedBudget(markedSections, initialBudget);
    }

    const usedTokens = markedSections
      .filter((section) => section.included)
      .reduce((total, section) => total + section.estimatedTokens, 0);

    return {
      limitTokens: safeLimit,
      usedTokens,
      remainingTokens: Math.max(0, safeLimit - usedTokens),
    };
  };
  const requiredBudget = estimateBudget(requiredIds);

  if (requiredBudget.usedTokens <= safeLimit) {
    sections.forEach((section) => {
      if (requiredIds.has(section.id)) {
        return;
      }

      const candidateIds = new Set([...requiredIds, ...includedOptionalIds, section.id]);
      const candidateBudget = estimateBudget(candidateIds);

      if (candidateBudget.usedTokens <= safeLimit) {
        includedOptionalIds.add(section.id);
      }
    });
  }

  const finalIncludedIds = new Set([...requiredIds, ...includedOptionalIds]);
  const allocatedSections = markIncludedSections(finalIncludedIds);
  const budget = estimateBudget(finalIncludedIds);

  return {
    sections: allocatedSections,
    budget,
  };
};
