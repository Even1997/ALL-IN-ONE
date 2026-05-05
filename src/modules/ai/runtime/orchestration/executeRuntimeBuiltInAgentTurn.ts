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
import { guardUnverifiedFileMutationClaims } from './runtimeFileMutationClaimGuard.ts';
import {
  createRuntimeSkillHookRunner,
  prepareRuntimeSkillsForTurn,
  resolveRuntimeSkillAllowedTools,
  type RuntimeSkillHookEvent,
} from '../../skills/runtimeSkillPreparation.ts';

const DEFAULT_CONTEXT_WINDOW_TOKENS = 258000;
const TOOL_LOOP_EXHAUSTED_PATTERN =
  /^Runtime tool loop exhausted after \d+ rounds before the model returned final content\.$/i;
const PROJECT_ACCESS_FAILURE_PATTERNS = [
  /Cannot access (?:file|directory) outside the current project\./i,
  /Current project root is unavailable\./i,
];
const ARTIFACT_REQUEST_PATTERN =
  /(?:requirements?\s*doc|requirements?|需求文档|PRD|spec|规格文档|设计文档|方案文档|草图|wireframe|ui direction)/i;
const SUBSTANTIVE_ARTIFACT_PATTERN =
  /(?:^|\n)\s{0,3}(?:#|##|\d+\.\s|[-*]\s)|(?:产品定位|目标用户|核心功能|用户故事|信息架构|交互流程|非功能需求|验收标准|里程碑|risk|scope|requirements?)/i;
const PROCESS_ONLY_REPLY_PATTERN =
  /^(?:我先|我来先|让我先|先看(?:一|一下)?|我先看|我来看看|好的，我看到|现在我来|接下来我来|我会先|我将先|let me|first[, ]+i(?:'| wi)?ll|now i(?:'| wi)?ll)/i;

const findProjectAccessFailure = (toolCalls: RuntimeToolStep[]) => {
  for (const toolCall of toolCalls) {
    if (toolCall.status !== 'failed' && toolCall.status !== 'blocked') {
      continue;
    }

    const candidates = [toolCall.resultContent, toolCall.resultPreview].filter(
      (value): value is string => Boolean(value?.trim())
    );
    const matched = candidates.find((value) =>
      PROJECT_ACCESS_FAILURE_PATTERNS.some((pattern) => pattern.test(value))
    );
    if (matched) {
      return matched.trim();
    }
  }

  return null;
};

const shouldRetryWithoutProjectTools = (input: {
  rawFinalContent: string;
  normalizedFinalContent: string;
  projectAccessFailure: string | null;
}) => {
  if (!input.projectAccessFailure) {
    return false;
  }

  const finalContentCandidates = [input.rawFinalContent, input.normalizedFinalContent];
  return finalContentCandidates.some((value) =>
    TOOL_LOOP_EXHAUSTED_PATTERN.test(value.trim()) ||
    PROJECT_ACCESS_FAILURE_PATTERNS.some((pattern) => pattern.test(value))
  );
};

const looksLikeArtifactRequest = (value: string) => ARTIFACT_REQUEST_PATTERN.test(value);

const looksLikeSubstantiveArtifact = (value: string) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return false;
  }

  return normalized.length >= 120 || SUBSTANTIVE_ARTIFACT_PATTERN.test(value);
};

const shouldRetryArtifactDraftAfterTooling = (input: {
  userInput: string;
  finalContent: string;
  toolCalls: RuntimeToolStep[];
}) => {
  if (!looksLikeArtifactRequest(input.userInput) || input.toolCalls.length === 0) {
    return false;
  }

  const normalized = input.finalContent.replace(/\s+/g, ' ').trim();
  if (!normalized || looksLikeSubstantiveArtifact(input.finalContent)) {
    return false;
  }

  return PROCESS_ONLY_REPLY_PATTERN.test(normalized);
};

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
  beforeToolCall?: (call: ToolCall) => Promise<void>;
  afterToolCall?: (call: ToolCall) => Promise<void>;
  onSkillHookEvent?: (event: RuntimeSkillHookEvent) => Promise<void> | void;
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
    onHookEvent: input.onSkillHookEvent,
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
    beforeToolCall: async (call: ToolCall) => {
      await hookRunner.beforeToolCall(call.name);
      await input.beforeToolCall?.(call);
    },
    afterToolCall: async (call: ToolCall) => {
      await hookRunner.afterToolCall(call.name);
      await input.afterToolCall?.(call);
    },
    onToolCallsChange: input.onToolCallsChange,
    onModelEvent: input.onModelEvent,
    executeModel: (prompt, _systemPrompt, onEvent) =>
      input.executeModel(prompt, directChat.systemPrompt, onEvent),
    executeTool: input.executeTool,
  });

  let finalContent = normalizeRuntimeDirectChatResponse({
    response: agentTurn.finalContent,
    streamedContent: agentTurn.finalContent,
  });
  const projectAccessFailure = findProjectAccessFailure(agentTurn.toolCalls);

  if (
    shouldRetryWithoutProjectTools({
      rawFinalContent: agentTurn.finalContent,
      normalizedFinalContent: finalContent,
      projectAccessFailure,
    })
  ) {
    const fallbackResponse = await input.executeModel(
      [
        directChat.prompt,
        'Runtime note:',
        `Project inspection failed: ${projectAccessFailure}`,
        'Do not call any more tools.',
        'Continue by answering the user directly using only the request, conversation history, memory, and already-loaded references.',
        'If the user asked for a draft, document, plan, or explanation, produce it now instead of stopping at the tool failure.',
        'If project-specific facts are missing, mention that briefly and continue with a best-effort answer.',
      ].join('\n\n'),
      directChat.systemPrompt,
      input.onModelEvent
    );
    finalContent = normalizeRuntimeDirectChatResponse({
      response: fallbackResponse,
      streamedContent: fallbackResponse,
    });
  }

  if (
    shouldRetryArtifactDraftAfterTooling({
      userInput: input.rawUserInput,
      finalContent,
      toolCalls: agentTurn.toolCalls,
    })
  ) {
    const artifactFallbackResponse = await input.executeModel(
      [
        directChat.prompt,
        'Runtime note:',
        'You already inspected the relevant project files for this request.',
        `The last assistant reply stopped at process narration instead of delivering the requested artifact: ${finalContent}`,
        'Do not call any more tools.',
        'The user asked for the artifact directly in chat.',
        'Output the full artifact body now.',
        'Do not describe what you will do next.',
      ].join('\n\n'),
      directChat.systemPrompt,
      input.onModelEvent
    );
    finalContent = normalizeRuntimeDirectChatResponse({
      response: artifactFallbackResponse,
      streamedContent: artifactFallbackResponse,
    });
  }

  finalContent = guardUnverifiedFileMutationClaims({
    content: finalContent,
    toolCalls: agentTurn.toolCalls,
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
