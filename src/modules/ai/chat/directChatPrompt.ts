import { buildKnowledgeOperationPolicy } from '../knowledge/knowledgeOperationPolicy.ts';
import { getDefaultChatSkillDefinitionById } from '../skills/skillLibrary.ts';
import {
  buildRuntimeSkillArgumentStatus,
  substituteRuntimeSkillArguments,
} from '../skills/runtimeSkillArguments.ts';
import type { RuntimeSkillDefinition } from '../runtime/skills/runtimeSkillTypes.ts';
import type { SkillIntent } from '../workflow/skillRouting.ts';
import { estimateTextTokens } from './contextBudget.ts';

type ConversationHistoryMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

const FILE_OPERATION_TRUTHFULNESS_POLICY =
  'Unless a real file operation succeeded, do not claim that a file was created, saved, edited, or deleted.';

const TASK_AUTHORIZATION_POLICY = [
  'Treat task-oriented user requests as authorization for low-risk internal actions needed to complete the task.',
  'This includes drafting and saving task-scoped local changes when they are reversible and stay inside the current workspace.',
  'Do not treat your own reply text as authorization.',
  'If the assistant just asked whether to save, write, create, or update something, and the next user message is a short affirmative confirmation such as "好", "可以", "行", "嗯", "确认", "OK", or "yes", treat that reply as authorization to perform the pending action.',
  'Ask for confirmation before irreversible, high-risk, external, or out-of-scope actions.',
].join(' ');

const INTERNAL_CONTEXT_DISCLOSURE_POLICY = [
  'Do not surface internal workspace plumbing unless the user explicitly asks for it.',
  'Treat directories or files such as .goodnight, _goodnight, .ai, GOODNIGHT.md, and CLAUDE.md as internal operating context, not user-facing project content.',
  'Do not mention internal framework names, hidden folders, or assistant-operating documents in summaries unless they are directly relevant to the user request.',
].join(' ');

const RESPONSE_STYLE_POLICY = [
  'Prefer a direct answer over a project audit.',
  'Do not turn simple questions into multi-section reports unless the user asks for a full inventory or analysis.',
  'When summarizing project content, focus on user-facing product files, features, pages, and deliverables first.',
].join(' ');

const buildFreeChatSystemPrompt = (projectName?: string) =>
  [
    'You are a natural conversational AI assistant for the current project.',
    `Current project: ${projectName || 'Unnamed project'}`,
    'Default to normal conversation unless the user explicitly invokes a specialized skill.',
    'Answer directly, naturally, and with awareness of current project context.',
    FILE_OPERATION_TRUTHFULNESS_POLICY,
    TASK_AUTHORIZATION_POLICY,
    INTERNAL_CONTEXT_DISCLOSURE_POLICY,
    RESPONSE_STYLE_POLICY,
  ].join('\n');

const buildSkillSystemPrompt = (projectName: string | undefined, skillName: string, skillPrompt: string) =>
  [
    'You are a natural conversational AI assistant for the current project.',
    `Current project: ${projectName || 'Unnamed project'}`,
    `The user explicitly invoked the ${skillName} skill for this request.`,
    'Follow the skill guidance only for the current request. Do not force the entire conversation into a workflow.',
    FILE_OPERATION_TRUTHFULNESS_POLICY,
    TASK_AUTHORIZATION_POLICY,
    INTERNAL_CONTEXT_DISCLOSURE_POLICY,
    RESPONSE_STYLE_POLICY,
    `<skill_playbook>\n${skillPrompt}\n</skill_playbook>`,
    skillName === 'UI Design'
      ? 'Preserve the validated shell structure and information hierarchy unless you clearly explain why a change is needed.'
      : 'Prefer direct, actionable output over vague brainstorming.',
  ].join('\n');

const buildSkillInvocationSection = (input: {
  skillName: string;
  cleanedInput: string;
  argumentHint?: string;
  argumentNames?: string[];
  model?: string;
  effort?: string;
}) => {
  const argumentStatus = buildRuntimeSkillArgumentStatus({
    rawArguments: input.cleanedInput,
    argumentHint: input.argumentHint,
    argumentNames: input.argumentNames,
  });
  const sections = [
    `<skill_invocation name="${input.skillName}">`,
    input.cleanedInput.trim() ? `arguments_text: ${input.cleanedInput.trim()}` : 'arguments_text: none',
    argumentStatus.parsedArguments.length > 0
      ? `parsed_arguments: ${argumentStatus.parsedArguments.join(' | ')}`
      : null,
    argumentStatus.argumentHint ? `argument_hint: ${argumentStatus.argumentHint}` : null,
    input.argumentNames && input.argumentNames.length > 0
      ? `argument_names: ${input.argumentNames.join(', ')}`
      : null,
    argumentStatus.missingArgumentNames.length > 0
      ? `missing_arguments: ${argumentStatus.missingArgumentNames.join(', ')}`
      : null,
    input.model ? `model_override: ${input.model}` : null,
    input.effort ? `effort: ${input.effort}` : null,
    '</skill_invocation>',
  ];

  return sections.filter((item): item is string => Boolean(item)).join('\n');
};

const buildIndexedKnowledgePolicy = () =>
  [
    'When reference_index or expanded_files are present, treat them as the primary fact sources for this answer.',
    'Prefer citing concrete files or artifact names when relying on indexed context.',
    'If you need to infer something beyond the sources, label it clearly as an inference.',
  ].join('\n');

const stripInternalThinking = (content: string) =>
  content
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/g, '')
    .trim();

const INTERNAL_HISTORY_BLOCK_PATTERNS = [
  /<goodnight-m-flow\b[^>]*>[\s\S]*?<\/goodnight-m-flow>/gi,
  /<[^>\n]*m-flow[^>\n]*>[\s\S]*?<\/[^>\n]*m-flow[^>\n]*>/gi,
];

const INTERNAL_HISTORY_LINE_PATTERNS = [
  /m-flow/i,
  /候选面/,
  /\bRoute\b.*识别/,
  /识别候选面/,
];

const stripInternalHistoryProtocols = (content: string) => {
  const withoutBlocks = INTERNAL_HISTORY_BLOCK_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, ''),
    content
  );

  return withoutBlocks
    .split('\n')
    .filter((line) => !INTERNAL_HISTORY_LINE_PATTERNS.some((pattern) => pattern.test(line.trim())))
    .join('\n')
    .trim();
};

const HISTORY_TOKEN_BUDGET = 8000;
const HISTORY_MAX_CHARS_PER_MSG = 2000;

const SAVE_LIKE_ACTION_PATTERN = /(?:\u4fdd\u5b58|\u5199\u5165|\u521b\u5efa|\u66f4\u65b0|\u4fee\u6539|\bsave\b|\bwrite\b|\bcreate\b|\bupdate\b)/i;
const CONFIRMATION_QUESTION_PATTERN = /(?:\u8981\u4e0d\u8981|\u662f\u5426|\u9700\u8981|\u53ef\u4ee5.*\u5417|\u5417|would you like|should i|do you want|confirm)/i;
const SHORT_AFFIRMATIVE_PATTERN = /^(?:\u597d|\u597d\u7684|\u53ef\u4ee5|\u884c|\u884c\u7684|\u55ef|\u55ef\u55ef|\u786e\u8ba4|\u5bf9|\u662f|\u662f\u7684|ok|okay|yes|yep|sure|go ahead)[\s\u3002\uff01!.,，]*$/i;
const SHORT_NEGATIVE_PATTERN = /^(?:\u4e0d|\u4e0d\u8981|\u4e0d\u7528|\u5148\u4e0d|\u7b97\u4e86|no|nope|cancel)[\s\u3002\uff01!.,，]*$/i;

const findLatestAssistantMessage = (messages: ConversationHistoryMessage[]) =>
  [...messages].reverse().find((message) => message.role === 'assistant' && message.content.trim().length > 0) || null;

const isShortAffirmativeReply = (value: string) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return Boolean(normalized && SHORT_AFFIRMATIVE_PATTERN.test(normalized) && !SHORT_NEGATIVE_PATTERN.test(normalized));
};

const looksLikePendingSaveQuestion = (value: string) =>
  SAVE_LIKE_ACTION_PATTERN.test(value) && CONFIRMATION_QUESTION_PATTERN.test(value);

const buildPendingConfirmationSection = (input: {
  userInput: string;
  conversationHistory: ConversationHistoryMessage[];
}) => {
  if (!isShortAffirmativeReply(input.userInput)) {
    return '';
  }

  const latestAssistant = findLatestAssistantMessage(input.conversationHistory);
  if (!latestAssistant || !looksLikePendingSaveQuestion(latestAssistant.content)) {
    return '';
  }

  return [
    'pending_user_confirmation:',
    'The latest user message is a short affirmative reply to the assistant\'s previous save/write/create/update question.',
    'Treat this as authorization to execute the previously proposed low-risk file action; do not wait for the literal word "save".',
  ].join('\n');
};

export const buildConversationHistorySection = (
  messages: ConversationHistoryMessage[] = [],
  maxTokens = HISTORY_TOKEN_BUDGET,
) => {
  if (messages.length === 0) {
    return '';
  }

  const visibleMessages = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      ...message,
      content: stripInternalHistoryProtocols(stripInternalThinking(message.content)).replace(/\s+/g, ' '),
    }))
    .filter((message) => message.content.length > 0);

  if (visibleMessages.length === 0) {
    return '';
  }

  // Build from most recent backwards, stop when token budget exceeded
  const included: string[] = [];
  let usedTokens = 0;

  for (let i = visibleMessages.length - 1; i >= 0; i -= 1) {
    const message = visibleMessages[i]!;
    const perMessageBudget = Math.max(300, Math.min(HISTORY_MAX_CHARS_PER_MSG, maxTokens - usedTokens));
    const truncated = message.content.length > perMessageBudget
      ? `${message.content.slice(0, perMessageBudget)}...[truncated]`
      : message.content;
    const line = `${message.role}: ${truncated}`;
    const lineTokens = estimateTextTokens(line);

    if (usedTokens + lineTokens > maxTokens) {
      break;
    }

    included.unshift(line);
    usedTokens += lineTokens;
  }

  return included.join('\n');
};

export const buildDirectChatPrompt = (options: {
  userInput: string;
  currentProjectName?: string;
  contextWindowTokens?: number;
  skillIntent: SkillIntent | null;
  availableSkills?: RuntimeSkillDefinition[];
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
    availableSkills = [],
    conversationHistory = [],
    contextLabels = [],
    referenceContext = null,
  } = options;

  const activeSkill =
    (skillIntent ? availableSkills.find((skill) => skill.id === skillIntent.skill) : null) ||
    (skillIntent ? getDefaultChatSkillDefinitionById(skillIntent.skill) : null);
  const skillLabel = activeSkill?.name || null;
  const resolvedSkillPrompt =
    activeSkill && skillIntent
      ? substituteRuntimeSkillArguments(
          activeSkill.prompt,
          skillIntent.cleanedInput,
          activeSkill.argumentNames || []
        )
      : activeSkill?.prompt || '';
  const conversationHistorySection = buildConversationHistorySection(conversationHistory);
  const pendingConfirmationSection = buildPendingConfirmationSection({
    userInput,
    conversationHistory,
  });
  const promptSections = [`user_request:\n${userInput.trim()}`];

  if (skillLabel) {
    promptSections.unshift(`mode: ${skillLabel}`);
  }

  if (skillLabel && activeSkill && skillIntent) {
    promptSections.unshift(
      buildSkillInvocationSection({
        skillName: activeSkill.name,
        cleanedInput: skillIntent.cleanedInput,
        argumentHint: activeSkill.argumentHint,
        argumentNames: activeSkill.argumentNames,
        model: activeSkill.model,
        effort: activeSkill.effort,
      })
    );
  }

  if (conversationHistorySection) {
    promptSections.unshift(`conversation_history:\n${conversationHistorySection}`);
  }

  if (pendingConfirmationSection) {
    promptSections.unshift(pendingConfirmationSection);
  }

  if (contextWindowTokens) {
    promptSections.push(`context_window:\n${contextWindowTokens} tokens`);
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
      skillLabel && activeSkill
        ? buildSkillSystemPrompt(currentProjectName, activeSkill.name, resolvedSkillPrompt)
        : buildFreeChatSystemPrompt(currentProjectName),
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
