// 文件作用：工具执行入口，位于turn 编排层。
// 所在链路：负责单轮执行的路由、流式控制、工具调用和收口。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import { ToolExecutor, type ToolCall, type ToolResult } from '../tools/toolExecutor.ts';
// 这个文件给 turn orchestration 提供工具执行器入口。
// 它本身很薄，主要价值是把 ToolExecutor 的构造细节留在这里集中管理。
// 如果你在排查“turn 里工具执行器是从哪来的”，先看这里。

export type { ToolCall, ToolResult };

// orchestration 层只通过这个工厂拿工具执行器，
// 这样 turn 协调器不需要知道 ToolExecutor 的构造细节。
export const createRuntimeChatToolExecutor = (projectRoot: string) => new ToolExecutor(projectRoot);
