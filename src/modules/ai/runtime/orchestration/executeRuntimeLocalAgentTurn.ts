import type { ReferenceFile } from '../../../knowledge/referenceFiles.ts';
import type { SkillIntent } from '../../workflow/skillRouting.ts';
import type { AgentMemoryEntry } from '../agentRuntimeTypes.ts';
import type { AgentContextConversationMessage } from '../context/agentContextTypes.ts';
import type { RuntimeSkillDefinition } from '../skills/runtimeSkillTypes.ts';
import {
  buildRuntimeLocalAgentPrompt,
  executeRuntimeLocalAgentPrompt,
  type RuntimeLocalAgentCommandResult,
} from './runtimeLocalAgentFlow.ts';
import { buildRuntimeDirectChatRequest } from './runtimeDirectChatFlow.ts';
import {
  prepareRuntimeSkillsForTurn,
  resolveRuntimeSkillAllowedTools,
} from '../../skills/runtimeSkillPreparation.ts';

const DEFAULT_CONTEXT_WINDOW_TOKENS = 258000;

export type ExecuteRuntimeLocalAgentTurnInput = {
  projectId: string;
  projectName: string;
  threadId: string;
  userInput: string;
  contextWindowTokens?: number;
  conversationHistory: AgentContextConversationMessage[];
  agentInstructions: string[];
  referenceFiles: ReferenceFile[];
  memoryEntries: AgentMemoryEntry[];
  activeSkills: RuntimeSkillDefinition[];
  skillIntent: SkillIntent | null;
  contextLabels: string[];
  agentId: string;
  projectRoot: string;
  runPrompt: (payload: {
    agent: string;
    projectRoot: string;
    prompt: string;
  }) => Promise<RuntimeLocalAgentCommandResult>;
};

export async function executeRuntimeLocalAgentTurn(
  input: ExecuteRuntimeLocalAgentTurnInput
): Promise<string> {
  const preparedSkills = await prepareRuntimeSkillsForTurn({
    skills: input.activeSkills,
    explicitSkillId: input.skillIntent?.skill || null,
    explicitArguments: input.skillIntent?.cleanedInput,
    sessionId: input.threadId,
    projectRoot: input.projectRoot,
  });
  const allowedTools = resolveRuntimeSkillAllowedTools({
    defaultAllowedTools: [],
    skills: preparedSkills,
    explicitSkillId: input.skillIntent?.skill || null,
  });
  const directChat = buildRuntimeDirectChatRequest({
    projectId: input.projectId,
    projectName: input.projectName,
    threadId: input.threadId,
    userInput: input.userInput,
    agentsInstructions: input.agentInstructions,
    referenceFiles: input.referenceFiles,
    memoryEntries: input.memoryEntries,
    activeSkills: preparedSkills,
    currentProjectName: input.projectName,
    contextWindowTokens: input.contextWindowTokens || DEFAULT_CONTEXT_WINDOW_TOKENS,
    skillIntent: input.skillIntent,
    conversationHistory: input.conversationHistory,
    contextLabels: input.contextLabels,
  });

  return executeRuntimeLocalAgentPrompt({
    agentId: input.agentId,
    projectRoot: input.projectRoot,
    prompt: buildRuntimeLocalAgentPrompt({
      systemPrompt: directChat.systemPrompt,
      prompt: directChat.prompt,
      allowedTools,
    }),
    runPrompt: input.runPrompt,
  });
}
