export type RuntimeMcpToolDefinition = {
  name: string;
  description: string;
  requiresApproval: boolean;
};

export type RuntimeMcpServer = {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  transport: 'builtin' | 'stdio' | 'http';
  description: string;
  enabled: boolean;
  toolNames: string[];
  tools?: RuntimeMcpToolDefinition[];
};

export type RuntimeMcpToolCall = {
  id: string;
  threadId: string;
  serverId: string;
  toolName: string;
  status: 'running' | 'completed' | 'error';
  summary: string;
  resultPreview: string;
  argumentsText: string;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
};
