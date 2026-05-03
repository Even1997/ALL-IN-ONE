import type { ToolCall, ToolResult } from '../../../../components/workspace/tools.ts';
import type { AITextStreamEvent } from '../../core/AIService.ts';
import { buildAgentContext } from '../context/buildAgentContext.ts';
import type { AgentContextBuildInput, AgentContextSnapshot } from '../context/agentContextTypes.ts';
import { runRuntimeToolLoop } from '../tools/runtimeToolLoop.ts';
import type { RuntimeToolLoopOptions, RuntimeToolMessage, RuntimeToolStep } from './agentKernelTypes.ts';

const GOODNIGHT_AGENT_SYSTEM_PROMPT = [
  'You are the GoodNight agent kernel.',
  'Use runtime tools when useful, then return final content for the user.',
  'Available runtime tools: glob, grep, ls, view, write, edit, bash, fetch, AskUserQuestion.',
  'Answer as a user-facing assistant, not as an internal runtime log.',
  'Do not mention internal operating files or folders such as .goodnight, _goodnight, .ai, GOODNIGHT.md, or CLAUDE.md unless the user explicitly asks about them.',
  'When summarizing a project, prioritize user-facing features, pages, documents, and deliverables over internal assistant infrastructure.',
  'Only call tools using this exact XML format:',
  '<tool_use>',
  '<tool name="tool_name">',
  '<tool_params>{"key":"value"}</tool_params>',
  '</tool>',
  '</tool_use>',
  'After receiving tool results, continue the task instead of stopping at the tool output.',
  'Never claim you changed files unless a write/edit tool actually succeeded.',
  'Use AskUserQuestion when the task is blocked on a user decision that cannot be inferred safely.',
].join('\n');

const DEFAULT_ALLOWED_TOOLS = ['glob', 'grep', 'ls', 'view', 'write', 'edit', 'bash', 'fetch', 'AskUserQuestion'];

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
    maxRounds: 4,
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
