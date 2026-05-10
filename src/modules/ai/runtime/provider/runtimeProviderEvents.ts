export type RuntimeProviderToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

// These are provider-native stream events. They remain the raw ingress format and
// should be adapted into canonical runtime events before becoming the primary UI model.

export type RuntimeProviderEvent =
  | { kind: 'thinking'; delta: string }
  | { kind: 'text'; delta: string }
  | { kind: 'tool_call'; toolCall: RuntimeProviderToolCall }
  | { kind: 'usage'; inputTokens: number; outputTokens: number; totalTokens?: number }
  | { kind: 'done'; finalText: string };
