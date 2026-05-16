// 文件作用：类型契约文件，位于MCP 运行时层。
// 所在链路：负责 MCP server、命令、调用结果与前端状态衔接。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这一组类型描述 runtime MCP 在前端侧需要记住的最小事实：
// 有哪些 server、每个线程执行过哪些 MCP tool call、以及删除结果等管理动作。
// 这个文件定义前端 runtime 视角下的 MCP 数据模型，是 MCP 子系统的类型边界。
// 它描述 server、tool、oauth、tool call 等最小事实，供 store、flow、client 在不混入执行细节的前提下共享。
// 如果你在排查“某个 MCP server/tool 在界面上展示异常”或字段映射不一致，先从这里确认类型语义。
export type RuntimeMcpTransport = 'builtin' | 'stdio' | 'http' | 'sse';

// 这是 server 暴露给前端的工具清单最小形态。
// 真正执行逻辑不在这里，这里只描述“能调用什么”和“是否需要审批”。
export type RuntimeMcpToolDefinition = {
  name: string;
  description: string;
  requiresApproval: boolean;
};

// OAuth 配置只保留运行 MCP 连接所需的关键字段，
// 具体认证过程由 sidecar / 后端桥处理。
export type RuntimeMcpOAuthConfig = {
  clientId?: string | null;
  callbackPort?: number | null;
};

// RuntimeMcpServer 是“服务器配置 + 当前连接状态”的组合体。
// 如果 MCP 配置页显示异常，通常先看这个结构是否被正确填满。
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

// RuntimeMcpToolCall 代表某个线程里一次 MCP 工具执行的生命周期快照。
// threadId 维度很重要，因为同一个 server 可能被多个会话并行调用。
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

// 删除结果单独建类型，是为了让 client / store 层表达“是否真的删掉了”。
export type RuntimeMcpDeleteResult = {
  id: string;
  deleted: boolean;
};
