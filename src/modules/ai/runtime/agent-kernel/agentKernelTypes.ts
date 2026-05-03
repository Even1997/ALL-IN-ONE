import type { ToolCall, ToolResult } from '../../../../components/workspace/tools.ts';
import type { AITextStreamEvent } from '../../core/AIService.ts';

export type RuntimeToolMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type RuntimeToolStep = {
  id: string;
  parentToolCallId?: string | null;
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed' | 'blocked';
  resultPreview: string;
  resultContent?: string;
  fileChanges?: Array<{
    path: string;
    beforeContent: string | null;
    afterContent: string | null;
  }>;
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
  onModelEvent?: (event: AITextStreamEvent) => void;
  callModel: (
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt: string,
    onEvent?: (event: AITextStreamEvent) => void
  ) => Promise<string>;
  executeTool: (call: ToolCall) => Promise<ToolResult>;
};
