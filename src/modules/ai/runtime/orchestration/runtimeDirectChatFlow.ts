import { buildDirectChatPrompt } from '../../chat/directChatPrompt.ts';
import { buildReferencePromptContext, isInternalAssistantReferencePath } from '../../chat/referencePromptContext.ts';
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

const INTERNAL_RESPONSE_PATTERNS = [
  /m-flow/i,
  /候选面/,
  /\bRoute\b.*识别/,
  /识别候选面/,
  /(^|[/\\])_goodnight([/\\]|$)/i,
  /(^|[/\\])\.goodnight([/\\]|$)/i,
  /(^|[/\\])\.ai([/\\]|$)/i,
  /\bGOODNIGHT\.md\b/i,
  /\bCLAUDE\.md\b/i,
];

const INTERNAL_RESPONSE_BLOCK_PATTERNS = [
  /<apply_skill\b[^>]*>[\s\S]*?<\/apply_skill>/gi,
  /<\s*\|\s*DSML\b[\s\S]*?<\s*\|\/\s*DSML\b[\s\S]*?(?=(?:\n\s*\n)|$)/gi,
];

const INTERNAL_RESPONSE_LINE_PATTERNS = [/^(?:让我先用|我先用)\s+[`'"]?[\w-]+[`'"]?\s+技能[:：]?\s*$/i];

const INTERNAL_RESPONSE_PROTOCOL_LINE_PATTERNS = [
  /(?:DSML|tool_calls>|invoke name=|parameter name=|string="true"|string="false")/i,
];

export const sanitizeInternalWorkspaceMentions = (value: string) => {
  const normalized = INTERNAL_RESPONSE_BLOCK_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, ''),
    value.replace(/\r/g, '')
  );
  const lines = normalized.split('\n');
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return true;
    }

    if (INTERNAL_RESPONSE_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      return false;
    }

    if (INTERNAL_RESPONSE_PROTOCOL_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      return false;
    }

    return !INTERNAL_RESPONSE_PATTERNS.some((pattern) => pattern.test(trimmed));
  });

  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
  const visibleReferenceFiles = input.referenceFiles.filter((file) => !isInternalAssistantReferencePath(file.path));
  const referenceContext =
    visibleReferenceFiles.length > 0
      ? buildReferencePromptContext({
          userInput: input.userInput,
          selectedFiles: visibleReferenceFiles,
        })
      : null;

  const runtimeContext = assembleAgentContext({
    projectId: input.projectId,
    projectName: input.projectName,
    threadId: input.threadId,
    agentsInstructions: input.agentsInstructions,
    referenceFiles: visibleReferenceFiles.map((file) => ({
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
    availableSkills: input.activeSkills,
    conversationHistory: input.conversationHistory,
    referenceContext,
    contextLabels: input.contextLabels,
  });
};

export const normalizeRuntimeDirectChatResponse = (input: {
  response: string;
  streamedContent: string;
  emptyResponseMessage?: string;
}) =>
  sanitizeInternalWorkspaceMentions(
    input.streamedContent.trim() || input.response.trim() || input.emptyResponseMessage || EMPTY_RUNTIME_RESPONSE_MESSAGE
  );
