import { buildDirectChatPrompt } from '../../chat/directChatPrompt.ts';
import { buildReferencePromptContext } from '../../chat/referencePromptContext.ts';
import type { ReferenceFile } from '../../../knowledge/referenceFiles.ts';
import { assembleAgentContext } from '../context/assembleAgentContext.ts';
import { buildThreadPrompt } from '../context/buildThreadPrompt.ts';
import type { AgentMemoryEntry } from '../agentRuntimeTypes.ts';
import type { RuntimeSkillDefinition } from '../skills/runtimeSkillTypes.ts';
import type { SkillIntent } from '../../workflow/skillRouting.ts';

const EMPTY_RUNTIME_RESPONSE_MESSAGE = '已收到请求，但这次没有返回内容。';

type RuntimeDirectChatConversationMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type RuntimeDirectChatReferenceFile = ReferenceFile;

const summarizeRuntimeReferenceContent = (value: string, fallback = '', maxLength = 240) => {
  const normalized = (value || fallback).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
};

export const buildRuntimeDirectChatRequest = (input: {
  projectId: string;
  projectName: string;
  threadId: string;
  userInput: string;
  agentsInstructions: string[];
  referenceFiles: RuntimeDirectChatReferenceFile[];
  memoryEntries: AgentMemoryEntry[];
  activeSkills: RuntimeSkillDefinition[];
  currentProjectName: string;
  contextWindowTokens: number;
  skillIntent: SkillIntent | null;
  conversationHistory: RuntimeDirectChatConversationMessage[];
  contextLabels: string[];
}) => {
  const referenceContext =
    input.referenceFiles.length > 0
      ? buildReferencePromptContext({
          userInput: input.userInput,
          selectedFiles: input.referenceFiles,
        })
      : null;

  const runtimeContext = assembleAgentContext({
    projectId: input.projectId,
    projectName: input.projectName,
    threadId: input.threadId,
    agentsInstructions: input.agentsInstructions,
    referenceFiles: input.referenceFiles.map((file) => ({
      path: file.path,
      summary: file.summary,
      content: file.summary || summarizeRuntimeReferenceContent(file.content, file.title, 240),
    })),
    memoryEntries: input.memoryEntries,
    activeSkills: input.activeSkills,
  });
  const runtimePrompt = buildThreadPrompt(runtimeContext, input.userInput);

  return buildDirectChatPrompt({
    userInput: runtimePrompt,
    currentProjectName: input.currentProjectName,
    contextWindowTokens: input.contextWindowTokens,
    skillIntent: input.skillIntent,
    conversationHistory: input.conversationHistory,
    referenceContext,
    contextLabels: input.contextLabels,
  });
};

export const normalizeRuntimeDirectChatResponse = (input: {
  response: string;
  streamedContent: string;
  emptyResponseMessage?: string;
}) => input.streamedContent.trim() || input.response.trim() || input.emptyResponseMessage || EMPTY_RUNTIME_RESPONSE_MESSAGE;
