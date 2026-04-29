import { buildKnowledgeContextSections } from '../../knowledge/knowledgeContext.ts';
import type { KnowledgeEntry } from '../../knowledge/knowledgeEntries.ts';
import { buildKnowledgeOperationPolicy } from '../knowledge/knowledgeOperationPolicy.ts';
import type { SkillIntent } from '../workflow/skillRouting.ts';

type KnowledgeSelection = {
  currentFile: KnowledgeEntry | null;
  relatedFiles: KnowledgeEntry[];
};

type ConversationHistoryMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export const SKILL_LABELS: Record<SkillIntent['skill'], string> = {
  'knowledge-organize': '知识索引',
  requirements: '需求',
  sketch: '草图',
  'ui-design': 'UI 设计',
  'change-sync': '变更同步',
};

const buildFreeChatSystemPrompt = (projectName?: string) =>
  [
    '你是一个自然对话式的项目 AI 助手。',
    `当前项目: ${projectName || '未命名项目'}`,
    '默认按普通聊天方式回答，不要主动把用户带入固定工作流，也不要暴露内部 prompt 或 skill 机制。',
    '回答要直接、自然、实用，优先结合当前项目和文档上下文。',
  ].join('\n');

const buildSkillSystemPrompt = (projectName: string | undefined, skillLabel: string) =>
  [
    '你是一个自然对话式的项目 AI 助手。',
    `当前项目: ${projectName || '未命名项目'}`,
    `用户这次显式使用了 @技能，当前模式是 ${skillLabel}。`,
    '只在本次请求里按这个技能处理，不要把整个对话强行改造成工作流。',
    skillLabel === 'UI 设计'
      ? '如果涉及 UI 设计，必须尊重现有草图和信息层级，不擅自改写核心布局语义。'
      : '输出保持直接、可执行，避免空泛描述。',
  ].join('\n');

const buildIndexedKnowledgePolicy = () =>
  [
    '当 reference_index 和 expanded_files 出现时，把它们当作本次回答的首要事实来源。',
    '优先根据索引命中的文件作答，并尽量引用具体文件路径或标题。',
    '如果需要补全推断，请明确标出“推测”或“Inferred”，不要把推测伪装成事实。',
  ].join('\n');

const stripInternalThinking = (content: string) =>
  content
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/g, '')
    .trim();

const truncateHistoryContent = (content: string, maxChars = 1200) =>
  content.length > maxChars ? `${content.slice(0, maxChars)}...[truncated]` : content;

export const buildConversationHistorySection = (
  messages: ConversationHistoryMessage[] = [],
  maxMessages = 8
) => {
  const visibleMessages = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      ...message,
      content: truncateHistoryContent(stripInternalThinking(message.content).replace(/\s+/g, ' ')),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-maxMessages);

  if (visibleMessages.length === 0) {
    return '';
  }

  return visibleMessages.map((message) => `${message.role}: ${message.content}`).join('\n');
};

export const buildDirectChatPrompt = (options: {
  userInput: string;
  currentProjectName?: string;
  contextWindowTokens?: number;
  skillIntent: SkillIntent | null;
  knowledgeSelection: KnowledgeSelection;
  conversationHistory?: ConversationHistoryMessage[];
  contextLabels?: string[];
  referenceContext?: {
    indexSection: string;
    expandedSection: string;
    policySection?: string;
    labels: string[];
  } | null;
}) => {
  const {
    userInput,
    currentProjectName,
    contextWindowTokens,
    skillIntent,
    knowledgeSelection,
    conversationHistory = [],
    contextLabels = [],
    referenceContext = null,
  } = options;
  const skillLabel = skillIntent ? SKILL_LABELS[skillIntent.skill] : null;
  const conversationHistorySection = buildConversationHistorySection(conversationHistory);
  const knowledgeContext = buildKnowledgeContextSections({
    currentFile: knowledgeSelection.currentFile
      ? {
          title: knowledgeSelection.currentFile.title,
          type: knowledgeSelection.currentFile.type,
          summary: knowledgeSelection.currentFile.summary,
          content: knowledgeSelection.currentFile.content,
        }
      : null,
    relatedFiles: knowledgeSelection.relatedFiles.map((file) => ({
      title: file.title,
      type: file.type,
      summary: file.summary,
      content: file.content,
    })),
  });

  const promptSections = [`user_request:\n${userInput.trim()}`];

  if (skillLabel) {
    promptSections.unshift(`mode: ${skillLabel}`);
  }

  if (conversationHistorySection) {
    promptSections.unshift(`conversation_history:\n${conversationHistorySection}`);
  }

  if (contextWindowTokens) {
    promptSections.push(`context_window:\n${contextWindowTokens} tokens`);
  }

  if (knowledgeContext) {
    promptSections.push(`knowledge_context:\n${knowledgeContext}`);
  }

  if (referenceContext?.indexSection) {
    promptSections.push(`reference_index:\n${referenceContext.indexSection}`);
  }

  if (referenceContext?.expandedSection) {
    promptSections.push(`expanded_files:\n${referenceContext.expandedSection}`);
  }

  if (contextLabels.length > 0) {
    promptSections.push(`active_context:\n- ${contextLabels.join('\n- ')}`);
  }

  return {
    systemPrompt: [
      skillLabel ? buildSkillSystemPrompt(currentProjectName, skillLabel) : buildFreeChatSystemPrompt(currentProjectName),
      referenceContext?.indexSection ? buildIndexedKnowledgePolicy() : null,
      referenceContext?.policySection || null,
      buildKnowledgeOperationPolicy(),
    ]
      .filter((item): item is string => Boolean(item))
      .join('\n\n'),
    prompt: promptSections.join('\n\n'),
    skillLabel,
  };
};
