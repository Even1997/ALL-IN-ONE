import type { ToolCall, ToolResult } from '../../../../components/workspace/tools.ts';
import type { AITextStreamEvent } from '../../core/AIService.ts';
import { buildAgentContext } from '../context/buildAgentContext.ts';
import type { AgentContextBuildInput, AgentContextSnapshot } from '../context/agentContextTypes.ts';
import { runRuntimeToolLoop } from '../tools/runtimeToolLoop.ts';
import type { RuntimeToolLoopOptions, RuntimeToolMessage, RuntimeToolStep } from './agentKernelTypes.ts';
import { getBuiltInRuntimeToolNames, isWindowsHost } from '../../../../utils/hostPlatform.ts';

const AVAILABLE_RUNTIME_TOOLS = getBuiltInRuntimeToolNames();
const GOODNIGHT_AGENT_SYSTEM_PROMPT = [
  'You are the GoodNight agent kernel.',
  'Use runtime tools when useful, then return final content for the user.',
  `Available runtime tools: ${AVAILABLE_RUNTIME_TOOLS.join(', ')}.`,
  'Answer as a user-facing assistant, not as an internal runtime log.',
  'Do not mention internal operating files or folders such as .goodnight, _goodnight, .ai, GOODNIGHT.md, or CLAUDE.md unless the user explicitly asks about them.',
  'For project-specific factual answers, prefer canonical source files, docs, tests, and package scripts over temporary, cache, hidden, worktree, or log files.',
  'When summarizing a project, prioritize user-facing features, pages, documents, and deliverables over internal assistant infrastructure.',
  'Only call tools using this exact XML format:',
  '<tool_use>',
  '<tool name="tool_name">',
  '<tool_params>{"key":"value"}</tool_params>',
  '</tool>',
  '</tool_use>',
  'After receiving tool results, continue the task instead of stopping at the tool output.',
  'Never claim you changed files unless a write/edit tool actually succeeded.',
  'For straightforward writing, drafting, brainstorming, or requirements/spec requests that do not depend on project files, answer directly without calling tools first.',
  'Before a tool batch, either call the tool immediately or give at most one short progress sentence.',
  'Do not emit repeated process narration such as "让我先...", "好的，我来...", or "现在我来..." across multiple consecutive replies.',
  'When a tool is obviously needed, call it immediately without a user-facing preamble.',
  'Only give a short progress sentence before tools if the user explicitly asked for status updates or the task is genuinely long-running.',
  'Do not greet the user, announce that you will inspect files, or say "让我先...", "好的，我来...", or "现在我来..." before the first tool result.',
  'Unless the user explicitly asked for progress updates, do not send any user-facing text before the first tool result.',
  'If you are still gathering information or preparing an edit, keep that wording in thinking and reserve user-facing text for findings, decisions, or final content.',
  ...(isWindowsHost()
    ? [
        'On Windows hosts, prefer the powershell tool for command execution.',
        'The bash tool remains available as a compatibility alias and also runs PowerShell-compatible commands by default.',
        'Use commands such as Get-Location; Get-ChildItem instead of bash-only syntax like pwd && ls -la.',
      ]
    : []),
  'Use AskUserQuestion when the task is blocked on a user decision that cannot be inferred safely.',
].join('\n');

const DEFAULT_ALLOWED_TOOLS = [...AVAILABLE_RUNTIME_TOOLS];

export type RunAgentTurnInput = AgentContextBuildInput & {
  allowedTools?: string[];
  beforeToolCall?: RuntimeToolLoopOptions['beforeToolCall'];
  afterToolCall?: RuntimeToolLoopOptions['afterToolCall'];
  onToolCallsChange?: (toolCalls: RuntimeToolStep[]) => void;
  onModelEvent?: (event: AITextStreamEvent) => void;
  executeModel(
    prompt: string,
    systemPrompt: string,
    onEvent?: (event: AITextStreamEvent) => void
  ): Promise<string>;
  executeTool(call: ToolCall): Promise<ToolResult>;
};

export type RunAgentTurnResult = {
  finalContent: string;
  context: AgentContextSnapshot;
  toolCalls: RuntimeToolStep[];
  transcript: RuntimeToolMessage[];
};

const renderModelPrompt = (messages: RuntimeToolMessage[]) =>
  messages.map((message) => `${message.role}:\n${message.content}`).join('\n\n');

export async function runAgentTurn(input: RunAgentTurnInput): Promise<RunAgentTurnResult> {
  const context = buildAgentContext(input);
  const result = await runRuntimeToolLoop({
    maxRounds: 8,
    contextWindowTokens: input.contextWindowTokens,
    initialPrompt: context.prompt,
    systemPrompt: GOODNIGHT_AGENT_SYSTEM_PROMPT,
    allowedTools: input.allowedTools || DEFAULT_ALLOWED_TOOLS,
    beforeToolCall: input.beforeToolCall,
    afterToolCall: input.afterToolCall,
    onToolCallsChange: input.onToolCallsChange,
    onModelEvent: input.onModelEvent,
    callModel: (messages, systemPrompt, onEvent) =>
      input.executeModel(renderModelPrompt(messages), systemPrompt, onEvent),
    executeTool: input.executeTool,
  });

  return {
    finalContent: result.finalContent,
    context,
    toolCalls: result.toolCalls,
    transcript: result.transcript,
  };
}
