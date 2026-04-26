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

export const CHAT_AGENTS: ChatAgentDefinition[] = [
  {
    id: 'claude',
    label: 'Claude',
    title: 'Claude CLI',
    runtime: 'local',
  },
  {
    id: 'codex',
    label: 'Codex',
    title: 'Codex CLI',
    runtime: 'local',
  },
  {
    id: 'built-in',
    label: 'AI',
    title: 'Built-in AI',
    runtime: 'built-in',
  },
];
