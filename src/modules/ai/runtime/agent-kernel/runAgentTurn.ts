import type { ToolCall, ToolResult } from '../../../../components/workspace/tools.ts';
import { buildAgentContext } from '../context/buildAgentContext.ts';
import type { AgentContextBuildInput, AgentContextSnapshot } from '../context/agentContextTypes.ts';
import { runRuntimeToolLoop } from '../tools/runtimeToolLoop.ts';
import type { RuntimeToolLoopOptions, RuntimeToolMessage, RuntimeToolStep } from './agentKernelTypes.ts';

const GOODNIGHT_AGENT_SYSTEM_PROMPT =
  'You are the GoodNight agent kernel. Use runtime tools when useful, then return final content for the user.';

const DEFAULT_ALLOWED_TOOLS = ['glob', 'grep', 'ls', 'view', 'write', 'edit', 'bash', 'fetch'];

export type RunAgentTurnInput = AgentContextBuildInput & {
  allowedTools?: string[];
  beforeToolCall?: RuntimeToolLoopOptions['beforeToolCall'];
  afterToolCall?: RuntimeToolLoopOptions['afterToolCall'];
  onToolCallsChange?: (toolCalls: RuntimeToolStep[]) => void;
  executeModel(prompt: string, systemPrompt: string): Promise<string>;
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
    callModel: (messages, systemPrompt) => input.executeModel(renderModelPrompt(messages), systemPrompt),
    executeTool: input.executeTool,
  });

  return {
    finalContent: result.finalContent,
    context,
    toolCalls: result.toolCalls,
    transcript: result.transcript,
  };
}
