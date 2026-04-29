import type { KnowledgeRetrievalMethod } from '../../../types';
import type { SystemIndexData } from '../systemIndex.ts';

export type KnowledgeRuntimeArtifact = {
  path: string;
  content: string;
};

export type KnowledgeRuntimePromptContext = {
  labels: string[];
  indexSection: string;
  expandedSection: string;
  policySection: string;
};

export type KnowledgeRuntimeAdapter = {
  method: KnowledgeRetrievalMethod;
  buildArtifacts: (options: { index: SystemIndexData; vaultPath: string }) => KnowledgeRuntimeArtifact[];
  buildPromptContext: (options: { index: SystemIndexData; userInput: string }) => KnowledgeRuntimePromptContext;
};
