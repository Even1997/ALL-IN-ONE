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
const SEARCH_TOOL_NAMES = new Set(['glob', 'grep']);
const WRITE_TOOL_NAMES = new Set(['write', 'edit']);

const buildToolGroupLabel = (toolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>) => {
  if (toolUses.length <= 1) {
    return undefined;
  }

  if (toolUses.every((toolUse) => READ_TOOL_NAMES.has(toolUse.toolName))) {
    return '\u8bfb\u53d6 ' + toolUses.length + ' \u4e2a\u6b65\u9aa4';
  }

  if (toolUses.every((toolUse) => SEARCH_TOOL_NAMES.has(toolUse.toolName))) {
    return '\u641c\u7d22\u4ee3\u7801 ' + toolUses.length + ' \u6b21';
  }

  if (toolUses.every((toolUse) => WRITE_TOOL_NAMES.has(toolUse.toolName))) {
    return '\u7f16\u8f91 ' + toolUses.length + ' \u4e2a\u6587\u4ef6';
  }

  return '\u6267\u884c ' + toolUses.length + ' \u4e2a\u6b65\u9aa4';
};

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

    items.push({
      kind: 'tool_group',
      id: `runtime-tool-group-${pendingToolUses[0]!.id}`,
      toolUses: [...pendingToolUses],
      groupLabel: buildToolGroupLabel(pendingToolUses),
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

    flushToolGroup();

    if (event.kind === 'tool_result' && toolUseIds.has(event.toolCallId)) {
      continue;
    }

    if (
      (event.kind === 'approval' && event.toolCallId && toolUseIds.has(event.toolCallId)) ||
      (event.kind === 'question' && event.payload.toolCallId && toolUseIds.has(event.payload.toolCallId))
    ) {
      continue;
    }

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
