export type RuntimeProviderToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type RuntimeProviderEvent =
  | { kind: 'thinking'; delta: string }
  | { kind: 'text'; delta: string }
  | { kind: 'tool_call'; toolCall: RuntimeProviderToolCall }
  | { kind: 'usage'; inputTokens: number; outputTokens: number; totalTokens?: number }
  | { kind: 'done'; finalText: string };
