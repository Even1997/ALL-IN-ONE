// 文件作用：执行器，位于turn 编排层。
// 所在链路：负责单轮执行的路由、流式控制、工具调用和收口。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件负责执行内建 agent 的完整单轮对话，是 runtime turn 编排里的“主执行器”之一。
// 它位于 turn coordinator 之下、agent kernel / tool execution 之上，负责把上下文、技能、记忆、工具循环与最终回复串成一次完整执行。
// 如果你在排查“内建 agent 为什么没调用工具 / 最终回复被兜底改写 / 技能没有进 prompt”，通常先从这里顺着主流程往下看。
import type { ToolCall, ToolResult } from '../tools/toolExecutor.ts';
import type { ReferenceFile } from '../../../knowledge/referenceFiles.ts';
import type { AITextStreamEvent } from '../../core/AIService.ts';
import type { SkillIntent } from '../../workflow/skillRouting.ts';
import { runAgentTurn } from '../agent-kernel/runAgentTurn.ts';
import type { RuntimeToolMessage, RuntimeToolStep } from '../agent-kernel/agentKernelTypes.ts';
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
const PROCESS_ONLY_REPLY_PATTERN =
  /^(?:我先|我来先|让我先|先看(?:一|一下)?|我先看|我来看看|好的，我看到|现在我来|接下来我来|我会先|我将先|let me|first[, ]+i(?:'| wi)?ll|now i(?:'| wi)?ll)/i;

const NON_STANDALONE_FINAL_REPLY_PATTERN =
  /^(?:上面|以上|前面|刚才|如上|前文|前述|the above|as above|as summarized above|the summary above|previously)\b/i;

// 这里专门识别“项目根目录访问失败”这一类工具错误，
// 让上层可以在最终回复里给出更明确的失败原因，而不是只展示泛化的工具报错。
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

// 当模型把工具轮次耗尽却没给 final 时，这里会从最近几次工具结果里拼一个可读摘要，
// 避免用户只看到“没有返回内容”这种信息量很低的兜底文案。
const buildToolLoopFallbackSummary = (toolCalls: RuntimeToolStep[]) => {
  const summarizedCalls = toolCalls
    .filter((toolCall) => toolCall.resultPreview.trim().length > 0)
    .slice(-4)
    .map((toolCall) =>
      [
        `Tool: ${toolCall.name}`,
        `Status: ${toolCall.status}`,
        `Input: ${JSON.stringify(toolCall.input)}`,
        `Result: ${toolCall.resultPreview.trim()}`,
      ].join('\n')
    );

  if (summarizedCalls.length === 0) {
    return '';
  }

  return `Tool results already gathered:\n${summarizedCalls.join('\n\n')}`;
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

const shouldRetryProcessOnlyFinalAfterTooling = (input: {
  finalContent: string;
  toolCalls: RuntimeToolStep[];
}) => {
  if (input.toolCalls.length === 0) {
    return false;
  }

  const normalized = input.finalContent.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return false;
  }

  return PROCESS_ONLY_REPLY_PATTERN.test(normalized);
};

const shouldRetryStandaloneFinalAnswer = (input: {
  finalContent: string;
  toolCalls: RuntimeToolStep[];
}) => input.toolCalls.length > 0 && NON_STANDALONE_FINAL_REPLY_PATTERN.test(input.finalContent.trim());

export type ExecuteRuntimeBuiltInAgentTurnInput = {
  projectId: string;
  projectName: string;
  threadId: string;
  projectRoot: string;
  userInput: string;
  rawUserInput: string;
  maxRounds?: number;
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
  transcript: RuntimeToolMessage[];
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

  const executeAgentTurn = (extraInstructions: string[] = []) =>
    runAgentTurn({
      maxRounds: input.maxRounds,
      projectId: input.projectId,
      projectName: input.projectName,
      threadId: input.threadId,
      userInput: input.userInput,
      contextWindowTokens,
      conversationHistory: input.conversationHistory,
      instructions: [...input.agentInstructions, ...extraInstructions],
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

  let agentTurn = await executeAgentTurn();

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

  if (TOOL_LOOP_EXHAUSTED_PATTERN.test(finalContent.trim())) {
    const exhaustedFallbackResponse = await input.executeModel(
      [
        directChat.prompt,
        'Runtime note:',
        'The previous attempt exhausted the tool loop before returning final content.',
        buildToolLoopFallbackSummary(agentTurn.toolCalls),
        'Do not call any more tools.',
        'Answer the user directly using the request, conversation history, memory, already-loaded references, and any tool results already gathered.',
        'If some project-specific detail is still uncertain, say that briefly and give the best direct answer you can.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      directChat.systemPrompt,
      input.onModelEvent
    );
    finalContent = normalizeRuntimeDirectChatResponse({
      response: exhaustedFallbackResponse,
      streamedContent: exhaustedFallbackResponse,
    });
  }

  if (
    shouldRetryProcessOnlyFinalAfterTooling({
      finalContent,
      toolCalls: agentTurn.toolCalls,
    })
  ) {
    const artifactFallbackResponse = await input.executeModel(
      [
        directChat.prompt,
        'Runtime note:',
        'You already used tools for this request.',
        `The last assistant reply stopped at process narration instead of delivering a complete answer: ${finalContent}`,
        'Do not call any more tools.',
        'Return the complete user-facing answer or requested artifact body now.',
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

  if (
    shouldRetryStandaloneFinalAnswer({
      finalContent,
      toolCalls: agentTurn.toolCalls,
    })
  ) {
    const standaloneFallbackResponse = await input.executeModel(
      [
        directChat.prompt,
        'Runtime note:',
        `The last assistant reply was not standalone and referred to prior hidden context: ${finalContent}`,
        buildToolLoopFallbackSummary(agentTurn.toolCalls),
        'Do not call any more tools.',
        'Return a complete standalone final answer now.',
        'Do not refer to "above", "previous", or omitted earlier text.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      directChat.systemPrompt,
      input.onModelEvent
    );
    finalContent = normalizeRuntimeDirectChatResponse({
      response: standaloneFallbackResponse,
      streamedContent: standaloneFallbackResponse,
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
    transcript: agentTurn.transcript,
  };
}
