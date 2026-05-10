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
