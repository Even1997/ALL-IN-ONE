import { buildKnowledgeOperationPolicy } from '../knowledge/knowledgeOperationPolicy.ts';
import { getDefaultChatSkillDefinitionById } from '../skills/skillLibrary.ts';
import {
  buildRuntimeSkillArgumentStatus,
  substituteRuntimeSkillArguments,
} from '../skills/runtimeSkillArguments.ts';
import type { RuntimeSkillDefinition } from '../runtime/skills/runtimeSkillTypes.ts';
import type { SkillIntent } from '../workflow/skillRouting.ts';

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

const truncateHistoryContent = (content: string, maxChars = 1200) =>
  content.length > maxChars ? `${content.slice(0, maxChars)}...[truncated]` : content;

export const buildConversationHistorySection = (
  messages: ConversationHistoryMessage[] = [],
  maxMessages = 8,
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
