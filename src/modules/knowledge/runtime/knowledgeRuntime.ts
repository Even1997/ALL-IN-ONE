import type { KnowledgeRetrievalMethod } from '../../../types';
import { llmwikiAdapter } from '../adapters/llmwiki/llmwikiAdapter.ts';
import { mFlowAdapter } from '../adapters/m-flow/mFlowAdapter.ts';
import { ragAdapter } from '../adapters/rag/ragAdapter.ts';
import type { SystemIndexData } from '../systemIndex.ts';
import type { KnowledgeRuntimeAdapter } from './types.ts';

const ADAPTERS: Record<KnowledgeRetrievalMethod, KnowledgeRuntimeAdapter> = {
  'm-flow': mFlowAdapter,
  llmwiki: llmwikiAdapter,
  rag: ragAdapter,
};

export const getKnowledgeRuntimeAdapter = (knowledgeRetrievalMethod: KnowledgeRetrievalMethod) =>
  ADAPTERS[knowledgeRetrievalMethod];

export const buildKnowledgeRuntimeArtifacts = (options: {
  index: SystemIndexData;
  knowledgeRetrievalMethod: KnowledgeRetrievalMethod;
  vaultPath: string;
}) => getKnowledgeRuntimeAdapter(options.knowledgeRetrievalMethod).buildArtifacts(options);

export const buildKnowledgeRuntimePromptContext = (options: {
  index: SystemIndexData;
  knowledgeRetrievalMethod: KnowledgeRetrievalMethod;
  userInput: string;
}) => getKnowledgeRuntimeAdapter(options.knowledgeRetrievalMethod).buildPromptContext(options);

export type {
  KnowledgeRuntimeArtifact,
  KnowledgeRuntimePromptContext,
} from './types.ts';
