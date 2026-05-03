import type { ToolCall, ToolResult } from '../../../../components/workspace/tools.ts';

export type RuntimeToolMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type RuntimeToolStep = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed' | 'blocked';
  resultPreview: string;
};

export type RuntimeToolLoopResult = {
  finalContent: string;
  transcript: RuntimeToolMessage[];
  toolCalls: RuntimeToolStep[];
};

export type RuntimeToolLoopOptions = {
  maxRounds: number;
  initialPrompt: string;
  systemPrompt: string;
  allowedTools: string[];
  beforeToolCall?: (call: ToolCall) => Promise<void>;
  afterToolCall?: (call: ToolCall) => Promise<void>;
  onToolCallsChange?: (toolCalls: RuntimeToolStep[]) => void;
  callModel: (
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt: string
  ) => Promise<string>;
  executeTool: (call: ToolCall) => Promise<ToolResult>;
};
