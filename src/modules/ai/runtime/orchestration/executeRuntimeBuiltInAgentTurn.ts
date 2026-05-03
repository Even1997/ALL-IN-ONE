import type { ToolCall, ToolResult } from '../../../../components/workspace/tools.ts';
import type { ReferenceFile } from '../../../knowledge/referenceFiles.ts';
import type { AITextStreamEvent } from '../../core/AIService.ts';
import type { SkillIntent } from '../../workflow/skillRouting.ts';
import { runAgentTurn } from '../agent-kernel/runAgentTurn.ts';
import type { RuntimeToolStep } from '../agent-kernel/agentKernelTypes.ts';
import type { AgentMemoryEntry } from '../agentRuntimeTypes.ts';
import type { AgentContextConversationMessage } from '../context/agentContextTypes.ts';
import { extractMemoryCandidates } from '../memory/extractMemoryCandidates.ts';
import type { RuntimeSkillDefinition } from '../skills/runtimeSkillTypes.ts';
import { buildRuntimeDirectChatRequest, normalizeRuntimeDirectChatResponse } from './runtimeDirectChatFlow.ts';
import {
  createRuntimeSkillHookRunner,
  prepareRuntimeSkillsForTurn,
  resolveRuntimeSkillAllowedTools,
} from '../../skills/runtimeSkillPreparation.ts';

const DEFAULT_CONTEXT_WINDOW_TOKENS = 258000;

export type ExecuteRuntimeBuiltInAgentTurnInput = {
  projectId: string;
  projectName: string;
  threadId: string;
  projectRoot: string;
  userInput: string;
  rawUserInput: string;
  contextWindowTokens?: number;
  conversationHistory: AgentContextConversationMessage[];
  agentInstructions: string[];
  referenceFiles: ReferenceFile[];
  memoryEntries: AgentMemoryEntry[];
  activeSkills: RuntimeSkillDefinition[];
  skillIntent: SkillIntent | null;
  contextLabels: string[];
  allowedTools: string[];
  onModelEvent?: (event: AITextStreamEvent) => void;
  executeModel: (
    prompt: string,
    systemPrompt: string,
    onEvent?: (event: AITextStreamEvent) => void
  ) => Promise<string>;
  executeTool: (call: ToolCall) => Promise<ToolResult>;
  onToolCallsChange?: (toolCalls: RuntimeToolStep[]) => void;
};

export type ExecuteRuntimeBuiltInAgentTurnResult = {
  finalContent: string;
  memoryCandidates: ReturnType<typeof extractMemoryCandidates>;
  toolCalls: RuntimeToolStep[];
};

export async function executeRuntimeBuiltInAgentTurn(
  input: ExecuteRuntimeBuiltInAgentTurnInput
): Promise<ExecuteRuntimeBuiltInAgentTurnResult> {
  const contextWindowTokens = input.contextWindowTokens || DEFAULT_CONTEXT_WINDOW_TOKENS;
  const preparedSkills = await prepareRuntimeSkillsForTurn({
    skills: input.activeSkills,
    explicitSkillId: input.skillIntent?.skill || null,
    explicitArguments: input.skillIntent?.cleanedInput,
    sessionId: input.threadId,
    projectRoot: input.projectRoot,
  });
  const hookRunner = createRuntimeSkillHookRunner({
    skills: preparedSkills,
    projectRoot: input.projectRoot,
  });
  const allowedTools = resolveRuntimeSkillAllowedTools({
    defaultAllowedTools: input.allowedTools,
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
    contextWindowTokens,
    skillIntent: input.skillIntent,
    conversationHistory: input.conversationHistory,
    contextLabels: input.contextLabels,
  });

  const agentTurn = await runAgentTurn({
    projectId: input.projectId,
    projectName: input.projectName,
    threadId: input.threadId,
    userInput: input.userInput,
    contextWindowTokens,
    conversationHistory: input.conversationHistory,
    instructions: input.agentInstructions,
    referenceFiles: input.referenceFiles.map((file) => ({
      path: file.path,
      summary: file.summary,
      content: file.content || file.summary || file.title,
    })),
    memoryEntries: input.memoryEntries,
    activeSkills: preparedSkills,
    allowedTools,
    beforeToolCall: (call: ToolCall) => hookRunner.beforeToolCall(call.name),
    afterToolCall: (call: ToolCall) => hookRunner.afterToolCall(call.name),
    onToolCallsChange: input.onToolCallsChange,
    onModelEvent: input.onModelEvent,
    executeModel: (prompt, _systemPrompt, onEvent) =>
      input.executeModel(prompt, directChat.systemPrompt, onEvent),
    executeTool: input.executeTool,
  });

  const finalContent = normalizeRuntimeDirectChatResponse({
    response: agentTurn.finalContent,
    streamedContent: agentTurn.finalContent,
  });
  const memoryCandidates = extractMemoryCandidates({
    threadId: input.threadId,
    userInput: input.rawUserInput,
    assistantContent: finalContent,
    createdAt: Date.now(),
  });

  return {
    finalContent,
    memoryCandidates,
    toolCalls: agentTurn.toolCalls,
  };
}
