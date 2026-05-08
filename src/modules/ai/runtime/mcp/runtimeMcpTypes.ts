export type RuntimeMcpTransport = 'builtin' | 'stdio' | 'http' | 'sse';

export type RuntimeMcpToolDefinition = {
  name: string;
  description: string;
  requiresApproval: boolean;
};

export type RuntimeMcpOAuthConfig = {
  clientId?: string | null;
  callbackPort?: number | null;
};

export type RuntimeMcpServer = {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  transport: RuntimeMcpTransport;
  description: string;
  enabled: boolean;
  toolNames: string[];
  tools?: RuntimeMcpToolDefinition[];
  command?: string | null;
  args?: string[];
  env?: Record<string, string>;
  url?: string | null;
  headers?: Record<string, string>;
  headersHelper?: string | null;
  oauth?: RuntimeMcpOAuthConfig | null;
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

export type RuntimeMcpDeleteResult = {
  id: string;
  deleted: boolean;
};
