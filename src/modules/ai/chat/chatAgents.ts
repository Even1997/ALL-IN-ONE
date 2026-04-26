import { getChatAgents } from './runtimeRegistry.ts';

export type ChatAgentId = 'claude' | 'codex' | 'built-in';

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
};

export const CHAT_AGENTS: ChatAgentDefinition[] = getChatAgents();
