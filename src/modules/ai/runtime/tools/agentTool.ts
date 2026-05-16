// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { ChatAgentId } from '../../chat/chatAgents.ts';
import type { ToolResult } from './toolExecutor.ts';

type RuntimeAgentToolId = Extract<ChatAgentId, 'claude' | 'codex'>;
type ResolvedRuntimeAgentToolInput = {
  prompt: string;
  preferredAgent?: RuntimeAgentToolId;
};

const resolvePreferredAgent = (value: unknown): RuntimeAgentToolId | null =>
  value === 'claude' || value === 'codex' ? value : null;

const resolvePrompt = (input: Record<string, unknown>) => {
  const candidate = input.prompt ?? input.task ?? input.request ?? input.summary;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
};

export const resolveRuntimeAgentToolInput = (
  input: Record<string, unknown>
): ResolvedRuntimeAgentToolInput | null => {
  const prompt = resolvePrompt(input);
  if (!prompt) {
    return null;
  }

  const preferredAgent = resolvePreferredAgent(
    input.preferred_agent ?? input.preferredAgent ?? input.agent,
  );

  if (
    'agent' in input &&
    input.agent !== undefined &&
    input.agent !== null &&
    preferredAgent === null
  ) {
    return null;
  }

  if (
    ('preferred_agent' in input && input.preferred_agent !== undefined && preferredAgent === null) ||
    ('preferredAgent' in input && input.preferredAgent !== undefined && preferredAgent === null)
  ) {
    return null;
  }

  return {
    prompt,
    preferredAgent: preferredAgent || undefined,
  };
};

export const buildRuntimeAgentToolResult = (input: {
  finalContent: string;
  changedPaths: string[];
}): ToolResult => {
  const sections = [input.finalContent.trim()].filter((value) => value.length > 0);

  if (input.changedPaths.length > 0) {
    sections.push(`Changed paths:\n${input.changedPaths.map((value) => `- ${value}`).join('\n')}`);
  }

  return {
    type: 'text',
    content: sections.join('\n\n').trim() || 'Agent tool completed with no summary.',
  };
};
