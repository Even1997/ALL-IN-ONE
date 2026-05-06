import { getSystemRuntimeSkillDefinitionById } from '../skills/skillLibrary.ts';
import {
  buildRuntimeSkillArgumentStatus,
  substituteRuntimeSkillArguments,
} from '../skills/runtimeSkillArguments.ts';
import type { RuntimeSkillDefinition } from '../runtime/skills/runtimeSkillTypes.ts';
import type { SkillIntent } from '../workflow/skillRouting.ts';
import { estimateTextTokens } from './contextBudget.ts';
import { getBuiltInRuntimeToolNames } from '../../../utils/hostPlatform.ts';

const AVAILABLE_RUNTIME_TOOLS = getBuiltInRuntimeToolNames().join(', ');

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
  'Only treat a confirmation as authorization when it is attached to an explicit pending runtime action.',
  'Ask for confirmation before irreversible, high-risk, external, or out-of-scope actions.',
].join(' ');

const INTERNAL_CONTEXT_DISCLOSURE_POLICY = [
  'Do not surface internal workspace plumbing unless the user explicitly asks for it.',
  'Treat directories or files such as .goodnight, _goodnight, .ai, GOODNIGHT.md, and CLAUDE.md as internal operating context, not user-facing project content.',
  'For project-specific factual answers, prefer canonical source files, docs, tests, and package scripts over temporary, cache, hidden, worktree, or log files.',
  'Do not mention internal framework names, hidden folders, or assistant-operating documents in summaries unless they are directly relevant to the user request.',
].join(' ');

const RESPONSE_STYLE_POLICY = [
  'Prefer a direct answer over a project audit.',
  'Do not turn simple questions into multi-section reports unless the user asks for a full inventory or analysis.',
  'When summarizing project content, focus on user-facing product files, features, pages, and deliverables first.',
  'Before a tool batch, either call the tool immediately or give at most one short progress sentence.',
  'Do not emit repeated process narration such as "让我先...", "好的，我来...", or "现在我来..." across multiple consecutive replies.',
  'When a tool is obviously needed, call it immediately without a user-facing preamble.',
  'Only give a short progress sentence before tools if the user explicitly asked for status updates or the task is genuinely long-running.',
  'Do not greet the user, announce that you will inspect files, or say "让我先...", "好的，我来...", or "现在我来..." before the first tool result.',
  'Unless the user explicitly asked for progress updates, do not send any user-facing text before the first tool result.',
  'If you are still gathering information or preparing an edit, keep that wording in thinking and reserve user-facing text for findings, decisions, or final content.',
].join(' ');

const ARTIFACT_DRAFT_POLICY = [
  'If the user asks for a requirements doc, PRD, spec, sketch, wireframe, UI direction, or similar artifact without explicitly asking to save it into a project file, draft the artifact directly in chat first.',
  'Only switch into immediate file-writing behavior when the user explicitly asks to save, create, or update a concrete project file.',
  'Treat slash skills as explicit opt-in accelerators, not as prerequisites for delivering the first useful answer.',
].join(' ');

const buildFreeChatSystemPrompt = (projectName?: string) =>
  [
    'You are a natural conversational AI assistant for the current project.',
    `Current project: ${projectName || 'Unnamed project'}`,
    'Default to normal conversation unless the user explicitly invokes a specialized skill.',
    'Answer directly, naturally, and with awareness of current project context.',
    `Available runtime tools: ${AVAILABLE_RUNTIME_TOOLS}.`,
    'Only call tools using this exact XML format:',
    '<tool_use>',
    '<tool name="tool_name">',
    '<tool_params>{"key":"value"}</tool_params>',
    '</tool>',
    '</tool_use>',
    'After receiving tool results, continue the task instead of stopping at the tool output.',
    FILE_OPERATION_TRUTHFULNESS_POLICY,
    TASK_AUTHORIZATION_POLICY,
    INTERNAL_CONTEXT_DISCLOSURE_POLICY,
    RESPONSE_STYLE_POLICY,
    ARTIFACT_DRAFT_POLICY,
  ].join('\n');

const buildSkillSystemPrompt = (projectName: string | undefined, skillName: string, skillPrompt: string) =>
  [
    'You are a natural conversational AI assistant for the current project.',
    `Current project: ${projectName || 'Unnamed project'}`,
    `The user explicitly invoked the ${skillName} skill for this request.`,
    'Follow the skill guidance only for the current request. Keep the conversation direct and task-focused.',
    FILE_OPERATION_TRUTHFULNESS_POLICY,
    TASK_AUTHORIZATION_POLICY,
    INTERNAL_CONTEXT_DISCLOSURE_POLICY,
    RESPONSE_STYLE_POLICY,
    ARTIFACT_DRAFT_POLICY,
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
  /鍊欓€夐潰/,
  /\bRoute\b.*璇嗗埆/,
  /璇嗗埆鍊欓€夐潰/,
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
    (skillIntent ? getSystemRuntimeSkillDefinitionById(skillIntent.skill) : null);
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
    ]
      .filter((item): item is string => Boolean(item))
      .join('\n\n'),
    prompt: promptSections.join('\n\n'),
    skillLabel,
  };
};
