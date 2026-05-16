// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

export type RuntimeProviderToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type RuntimeProviderMessagePhase = 'commentary' | 'final_answer' | 'unknown';

// These are provider-native stream events. They remain the raw ingress format and
// should be adapted into canonical runtime events before becoming the primary UI model.

export type RuntimeProviderEvent =
  | { kind: 'thinking'; delta: string }
  | { kind: 'text'; delta: string; phase?: RuntimeProviderMessagePhase }
  | { kind: 'commentary_text'; delta: string }
  | { kind: 'final_text'; delta: string }
  | { kind: 'tool_call'; toolCall: RuntimeProviderToolCall }
  | { kind: 'usage'; inputTokens: number; outputTokens: number; totalTokens?: number }
  | { kind: 'done'; finalText: string };
