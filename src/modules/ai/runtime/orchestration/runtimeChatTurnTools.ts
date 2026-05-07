import { getBuiltInRuntimeToolNames } from '../../../../utils/hostPlatform.ts';
import { ToolExecutor, type ToolCall, type ToolResult } from '../tools/toolExecutor.ts';

export type { ToolCall, ToolResult };

export const ASK_USER_TOOL_NAME = 'AskUserQuestion';
export const READ_ONLY_CHAT_TOOLS = ['glob', 'grep', 'ls', 'view', ASK_USER_TOOL_NAME];
export const BUILT_IN_EXECUTION_TOOLS = [...getBuiltInRuntimeToolNames()];
export const RISKY_BUILT_IN_TOOLS = new Set(['write', 'edit', 'bash', 'powershell', 'fetch', 'agent']);

export const createRuntimeChatToolExecutor = (projectRoot: string) => new ToolExecutor(projectRoot);
