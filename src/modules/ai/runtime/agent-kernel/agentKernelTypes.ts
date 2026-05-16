// 文件作用：类型契约文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { ToolCall, ToolResult } from '../tools/toolExecutor.ts';
import type { AITextStreamEvent } from '../../core/AIService.ts';
import type { CompactionReason } from '../compaction/compactionTypes.ts';
import type { AgentEvent } from '../dispatch/agentEvents.ts';

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
    operation?: 'write' | 'edit' | 'delete';
    beforeContent: string | null;
    afterContent: string | null;
    verified?: boolean;
  }>;
};

export type RuntimeToolLoopResult = {
  finalContent: string;
  transcript: RuntimeToolMessage[];
  toolCalls: RuntimeToolStep[];
};

export type RuntimeToolLoopOptions = {
  maxRounds: number;
  contextWindowTokens?: number;
  initialPrompt: string;
  systemPrompt: string;
  allowedTools: string[];
  beforeToolCall?: (call: ToolCall) => Promise<void>;
  afterToolCall?: (call: ToolCall) => Promise<void>;
  onToolCallsChange?: (toolCalls: RuntimeToolStep[]) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  onModelEvent?: (event: AITextStreamEvent) => void;
  onContextCompaction?: (reason: CompactionReason) => void;
  callModel: (
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt: string,
    onEvent?: (event: AITextStreamEvent) => void
  ) => Promise<string>;
  executeTool: (call: ToolCall) => Promise<ToolResult>;
};
