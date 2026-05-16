// 文件作用：执行器，位于turn 编排层。
// 所在链路：负责单轮执行的路由、流式控制、工具调用和收口。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件负责执行本地 agent（如本地命令型代理）的一次 turn，是 runtime turn 编排里的另一条执行分支。
// 它主要把对话上下文、技能、记忆和允许工具整理成 prompt，再调用本地 agent runner，并把结果收口成统一结构。
// 如果你在排查“本地 agent 输出为空 / 改动路径没被带回 / 技能对本地代理没生效”，先看这里的组装与调用。
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
  allowedTools?: string[];
  agentId: string;
  projectRoot: string;
  runPrompt: (payload: {
    agent: string;
    projectRoot: string;
    prompt: string;
  }) => Promise<RuntimeLocalAgentCommandResult>;
};

export type ExecuteRuntimeLocalAgentTurnResult = {
  finalContent: string;
  changedPaths: string[];
};

export async function executeRuntimeLocalAgentTurn(
  input: ExecuteRuntimeLocalAgentTurnInput
): Promise<ExecuteRuntimeLocalAgentTurnResult> {
  // 先按本轮显式 skill 与项目上下文准备运行时技能，
  // 保证本地 agent 与内建 agent 一样走统一的技能预处理入口。
  const preparedSkills = await prepareRuntimeSkillsForTurn({
    skills: input.activeSkills,
    explicitSkillId: input.skillIntent?.skill || null,
    explicitArguments: input.skillIntent?.cleanedInput,
    sessionId: input.threadId,
    projectRoot: input.projectRoot,
  });
  const allowedTools = resolveRuntimeSkillAllowedTools({
    defaultAllowedTools: input.allowedTools || [],
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

  const result = await executeRuntimeLocalAgentPrompt({
    agentId: input.agentId,
    projectRoot: input.projectRoot,
    prompt: buildRuntimeLocalAgentPrompt({
      systemPrompt: directChat.systemPrompt,
      prompt: directChat.prompt,
      allowedTools,
    }),
    runPrompt: input.runPrompt,
  });

  return {
    finalContent: typeof result === 'string' ? result : result.content,
    changedPaths: typeof result === 'string' ? [] : result.changedPaths,
  };
}
