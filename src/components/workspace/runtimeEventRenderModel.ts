import type { StoredChatRuntimeEvent } from '../../modules/ai/store/aiChatStore';

export type RuntimeEventToolGroupRenderItem = {
  kind: 'tool_group';
  id: string;
  toolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>;
  groupLabel?: string;
};

export type RuntimeEventMessageRenderItem = {
  kind: 'message';
  id: string;
  event: Exclude<StoredChatRuntimeEvent, { kind: 'tool_use' | 'tool_result' }>;
};

export type RuntimeEventStandaloneResultRenderItem = {
  kind: 'standalone_result';
  id: string;
  event: Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>;
};

export type RuntimeEventRenderItem =
  | RuntimeEventToolGroupRenderItem
  | RuntimeEventMessageRenderItem
  | RuntimeEventStandaloneResultRenderItem;

export type RuntimeEventRenderModel = {
  items: RuntimeEventRenderItem[];
  resultMap: Map<string, Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>>;
  approvalsByToolCallId: Map<string, Array<Extract<StoredChatRuntimeEvent, { kind: 'approval' }>>>;
  questionsByToolCallId: Map<string, Array<Extract<StoredChatRuntimeEvent, { kind: 'question' }>>>;
  childToolUsesByParent: Map<string, Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>>;
};

const READ_TOOL_NAMES = new Set(['view', 'glob', 'grep', 'ls']);

export const buildRuntimeEventRenderModel = (
  runtimeEvents: StoredChatRuntimeEvent[]
): RuntimeEventRenderModel => {
  const items: RuntimeEventRenderItem[] = [];
  const resultMap = new Map<string, Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>>();
  const approvalsByToolCallId = new Map<string, Array<Extract<StoredChatRuntimeEvent, { kind: 'approval' }>>>();
  const questionsByToolCallId = new Map<string, Array<Extract<StoredChatRuntimeEvent, { kind: 'question' }>>>();
  const childToolUsesByParent = new Map<string, Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>>();
  const toolUseIds = new Set<string>();
  let pendingToolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>> = [];

  const flushToolGroup = () => {
    if (pendingToolUses.length === 0) {
      return;
    }

    const isReadBatch = pendingToolUses.length >= 3 && pendingToolUses.every((t) => READ_TOOL_NAMES.has(t.toolName));
    const groupLabel =
      pendingToolUses.length > 1
        ? `${isReadBatch ? '已读取' : '已运行'} ${pendingToolUses.length} 条命令`
        : undefined;

    items.push({
      kind: 'tool_group',
      id: `runtime-tool-group-${pendingToolUses[0]!.id}`,
      toolUses: [...pendingToolUses],
      groupLabel,
    });
    pendingToolUses = [];
  };

  for (const event of runtimeEvents) {
    if (event.kind === 'tool_use') {
      toolUseIds.add(event.toolCallId);
      if (event.parentToolCallId) {
        const bucket = childToolUsesByParent.get(event.parentToolCallId) || [];
        bucket.push(event);
        childToolUsesByParent.set(event.parentToolCallId, bucket);
      }
      continue;
    }

    if (event.kind === 'tool_result') {
      resultMap.set(event.toolCallId, event);
      continue;
    }

    if (event.kind === 'approval' && event.toolCallId) {
      const bucket = approvalsByToolCallId.get(event.toolCallId) || [];
      bucket.push(event);
      approvalsByToolCallId.set(event.toolCallId, bucket);
      continue;
    }

    if (event.kind === 'question' && event.payload.toolCallId) {
      const bucket = questionsByToolCallId.get(event.payload.toolCallId) || [];
      bucket.push(event);
      questionsByToolCallId.set(event.payload.toolCallId, bucket);
    }
  }

  for (const event of runtimeEvents) {
    if (event.kind === 'tool_use') {
      if (event.parentToolCallId && toolUseIds.has(event.parentToolCallId)) {
        continue;
      }
      pendingToolUses.push(event);
      continue;
    }

    if (event.kind === 'tool_result' && toolUseIds.has(event.toolCallId)) {
      continue;
    }

    if (
      (event.kind === 'approval' && event.toolCallId && toolUseIds.has(event.toolCallId)) ||
      (event.kind === 'question' && event.payload.toolCallId && toolUseIds.has(event.payload.toolCallId))
    ) {
      continue;
    }

    flushToolGroup();

    if (event.kind === 'tool_result') {
      items.push({
        kind: 'standalone_result',
        id: event.id,
        event,
      });
      continue;
    }

    items.push({
      kind: 'message',
      id: event.id,
      event,
    });
  }

  flushToolGroup();
  return { items, resultMap, approvalsByToolCallId, questionsByToolCallId, childToolUsesByParent };
};

export const buildRuntimeToolStreamModel = buildRuntimeEventRenderModel;
