import { ToolExecutor, type ToolCall, type ToolResult } from '../tools/toolExecutor.ts';

export type { ToolCall, ToolResult };

export const createRuntimeChatToolExecutor = (projectRoot: string) => new ToolExecutor(projectRoot);
