// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import { getChatAgents } from './runtimeRegistry.ts';

export type ChatAgentId = 'claude' | 'codex' | 'team' | 'built-in';

export type ChatAgentRuntime = 'local' | 'built-in';

export type ChatAgentDefinition = {
  id: ChatAgentId;
  label: string;
  title: string;
  runtime: ChatAgentRuntime;
};

export type LocalAgentCommandResult = {
  success: boolean;
  content: string;
  error: string | null;
  exitCode: number | null;
  changedPaths?: string[] | null;
};

export const CHAT_AGENTS: ChatAgentDefinition[] = getChatAgents();
