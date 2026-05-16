// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

export const ASK_USER_TOOL_NAME = 'AskUserQuestion';

export const READ_ONLY_RUNTIME_TOOLS = ['glob', 'grep', 'ls', 'view', ASK_USER_TOOL_NAME] as const;
export const MUTATING_RUNTIME_TOOLS = ['write', 'edit', 'bash', 'powershell', 'fetch', 'agent'] as const;
export const STREAM_SAFE_RUNTIME_TOOLS = new Set(['glob', 'grep', 'ls', 'view']);
export const RISKY_RUNTIME_TOOLS = new Set<string>(MUTATING_RUNTIME_TOOLS);

export const getBuiltInRuntimeToolNames = (isWindows: boolean) =>
  [
    'glob',
    'grep',
    'ls',
    'view',
    'write',
    'edit',
    ...(isWindows ? ['powershell'] : ['bash']),
    'fetch',
    'agent',
    ASK_USER_TOOL_NAME,
  ] as const;

export const getTurnAllowedRuntimeTools = (input: {
  sandboxPolicy: 'deny' | 'ask' | 'allow' | 'bypass';
  isWindows: boolean;
}) => (input.sandboxPolicy === 'deny'
  ? [...READ_ONLY_RUNTIME_TOOLS]
  : [...getBuiltInRuntimeToolNames(input.isWindows)]);
