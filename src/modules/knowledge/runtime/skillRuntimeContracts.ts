import type { KnowledgeRetrievalMethod } from '../../../types';
import llmwikiManifest from '../../../../goodnight-skills/built-in/goodnight-llmwiki/skill.json' with { type: 'json' };
import mFlowManifest from '../../../../goodnight-skills/built-in/goodnight-m-flow/skill.json' with { type: 'json' };
import ragManifest from '../../../../goodnight-skills/built-in/goodnight-rag/skill.json' with { type: 'json' };

export type KnowledgeSkillRuntimeContract = {
  skillId: string;
  skillName: string;
  knowledgeMethod: KnowledgeRetrievalMethod;
  contextSection: string;
  visibleOutputs: string[];
  stateOutputs: string[];
  promptPolicy: string;
};

type SkillManifestWithRuntime = {
  id: string;
  name: string;
  runtime: Omit<KnowledgeSkillRuntimeContract, 'skillId' | 'skillName'>;
};

const toContract = (manifest: SkillManifestWithRuntime): KnowledgeSkillRuntimeContract => ({
  skillId: manifest.id,
  skillName: manifest.name,
  ...manifest.runtime,
});

export const KNOWLEDGE_SKILL_RUNTIME_CONTRACTS: Record<
  KnowledgeRetrievalMethod,
  KnowledgeSkillRuntimeContract
> = {
  llmwiki: toContract(llmwikiManifest as SkillManifestWithRuntime),
  'm-flow': toContract(mFlowManifest as SkillManifestWithRuntime),
  rag: toContract(ragManifest as SkillManifestWithRuntime),
};

export const getKnowledgeSkillRuntimeContract = (method: KnowledgeRetrievalMethod) =>
  KNOWLEDGE_SKILL_RUNTIME_CONTRACTS[method];
