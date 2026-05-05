import type { StoredChatRuntimeEvent } from '../../modules/ai/store/aiChatStore';

export type RuntimeToolGroupType =
  | 'edit'
  | 'command'
  | 'fetch'
  | 'search'
  | 'read'
  | 'plan'
  | 'agent'
  | 'workflow'
  | 'input'
  | 'other';

export type RuntimeEventToolGroupRenderItem = {
  kind: 'tool_group';
  id: string;
  groupType: RuntimeToolGroupType;
  toolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>;
  groupLabel: string;
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
  orderedRuntimeEvents: StoredChatRuntimeEvent[];
  resultMap: Map<string, Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>>;
  approvalsByToolCallId: Map<string, Array<Extract<StoredChatRuntimeEvent, { kind: 'approval' }>>>;
  questionsByToolCallId: Map<string, Array<Extract<StoredChatRuntimeEvent, { kind: 'question' }>>>;
  childToolUsesByParent: Map<string, Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>>;
  toolUseByToolCallId: Map<string, Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>;
};

const ASK_USER_TOOL_NAME = 'AskUserQuestion';
const WRITE_TOOL_NAMES = new Set(['write', 'edit', 'project_file_apply']);
const COMMAND_TOOL_NAMES = new Set(['bash']);
const FETCH_TOOL_NAMES = new Set(['fetch']);
const SEARCH_TOOL_NAMES = new Set(['glob', 'grep']);
const READ_TOOL_NAMES = new Set(['view', 'ls', 'project_file_read']);
const PLAN_TOOL_NAMES = new Set(['project_file_plan']);
const AGENT_TOOL_NAMES = new Set(['run_local_agent', 'run_agent_team', 'team_phase', 'team_member_task']);
const WORKFLOW_TOOL_NAMES = new Set(['workflow_package', 'workflow_package_stage', 'workflow_stage', 'workflow_skill']);

const sortRuntimeEventsByCreatedAt = (runtimeEvents: StoredChatRuntimeEvent[]) =>
  [...runtimeEvents].sort((left, right) => left.createdAt - right.createdAt);

const classifyToolGroupType = (
  toolUse: Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>
): RuntimeToolGroupType => {
  if (toolUse.toolName === ASK_USER_TOOL_NAME) {
    return 'input';
  }
  if (WRITE_TOOL_NAMES.has(toolUse.toolName)) {
    return 'edit';
  }
  if (COMMAND_TOOL_NAMES.has(toolUse.toolName)) {
    return 'command';
  }
  if (FETCH_TOOL_NAMES.has(toolUse.toolName)) {
    return 'fetch';
  }
  if (SEARCH_TOOL_NAMES.has(toolUse.toolName)) {
    return 'search';
  }
  if (READ_TOOL_NAMES.has(toolUse.toolName)) {
    return 'read';
  }
  if (PLAN_TOOL_NAMES.has(toolUse.toolName)) {
    return 'plan';
  }
  if (AGENT_TOOL_NAMES.has(toolUse.toolName)) {
    return 'agent';
  }
  if (WORKFLOW_TOOL_NAMES.has(toolUse.toolName)) {
    return 'workflow';
  }
  return 'other';
};

const getResultFileChangeCounts = (
  resultEvent: Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }> | undefined
) => {
  const counts = {
    created: 0,
    updated: 0,
    deleted: 0,
  };

  for (const fileChange of resultEvent?.fileChanges || []) {
    if (fileChange.beforeContent === null && fileChange.afterContent !== null) {
      counts.created += 1;
      continue;
    }

    if (fileChange.beforeContent !== null && fileChange.afterContent === null) {
      counts.deleted += 1;
      continue;
    }

    counts.updated += 1;
  }

  return counts;
};

const buildCombinedToolGroupLabel = (
  toolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>,
  resultMap: Map<string, Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>>
) => {
  const counts = {
    createdFiles: 0,
    updatedFiles: 0,
    deletedFiles: 0,
    command: 0,
    fetch: 0,
    search: 0,
    read: 0,
    plan: 0,
    agent: 0,
    workflow: 0,
    input: 0,
    other: 0,
  };

  for (const toolUse of toolUses) {
    const groupType = classifyToolGroupType(toolUse);

    if (groupType === 'edit') {
      const resultEvent = resultMap.get(toolUse.toolCallId);
      const fileChangeCounts = getResultFileChangeCounts(resultEvent);
      const totalFileChanges =
        fileChangeCounts.created + fileChangeCounts.updated + fileChangeCounts.deleted;

      if (totalFileChanges > 0) {
        counts.createdFiles += fileChangeCounts.created;
        counts.updatedFiles += fileChangeCounts.updated;
        counts.deletedFiles += fileChangeCounts.deleted;
      } else {
        counts.updatedFiles += 1;
      }
      continue;
    }

    if (groupType === 'command') {
      counts.command += 1;
      continue;
    }
    if (groupType === 'fetch') {
      counts.fetch += 1;
      continue;
    }
    if (groupType === 'search') {
      counts.search += 1;
      continue;
    }
    if (groupType === 'read') {
      counts.read += 1;
      continue;
    }
    if (groupType === 'plan') {
      counts.plan += 1;
      continue;
    }
    if (groupType === 'agent') {
      counts.agent += 1;
      continue;
    }
    if (groupType === 'workflow') {
      counts.workflow += 1;
      continue;
    }
    if (groupType === 'input') {
      counts.input += 1;
      continue;
    }

    counts.other += 1;
  }

  const segments: string[] = [];

  if (counts.createdFiles > 0) {
    segments.push(`已创建 ${counts.createdFiles} 个文件`);
  }
  if (counts.updatedFiles > 0) {
    segments.push(`已编辑 ${counts.updatedFiles} 个文件`);
  }
  if (counts.deletedFiles > 0) {
    segments.push(`已删除 ${counts.deletedFiles} 个文件`);
  }
  if (counts.command > 0) {
    segments.push(`已运行 ${counts.command} 条命令`);
  }
  if (counts.fetch > 0) {
    segments.push(`已访问 ${counts.fetch} 个地址`);
  }
  if (counts.search > 0) {
    segments.push(`已搜索 ${counts.search} 次`);
  }
  if (counts.read > 0) {
    segments.push(`已读取 ${counts.read} 项内容`);
  }
  if (counts.plan > 0) {
    segments.push(`已规划 ${counts.plan} 个步骤`);
  }
  if (counts.agent > 0) {
    segments.push(`已分派 ${counts.agent} 个任务`);
  }
  if (counts.workflow > 0) {
    segments.push(`已执行 ${counts.workflow} 个流程`);
  }
  if (counts.input > 0) {
    segments.push(`等待 ${counts.input} 个输入`);
  }
  if (counts.other > 0) {
    segments.push(`已执行 ${counts.other} 个操作`);
  }

  return segments.join(',');
};

export const buildRuntimeEventRenderModel = (
  runtimeEvents: StoredChatRuntimeEvent[]
): RuntimeEventRenderModel => {
  const orderedRuntimeEvents = sortRuntimeEventsByCreatedAt(runtimeEvents);
  const items: RuntimeEventRenderItem[] = [];
  const resultMap = new Map<string, Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>>();
  const approvalsByToolCallId = new Map<string, Array<Extract<StoredChatRuntimeEvent, { kind: 'approval' }>>>();
  const questionsByToolCallId = new Map<string, Array<Extract<StoredChatRuntimeEvent, { kind: 'question' }>>>();
  const childToolUsesByParent = new Map<string, Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>>();
  const toolUseByToolCallId = new Map<string, Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>();
  const toolUseIds = new Set<string>();
  let pendingGroup:
    | {
        groupType: RuntimeToolGroupType;
        toolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>;
      }
    | null = null;

  const flushToolGroup = () => {
    if (!pendingGroup || pendingGroup.toolUses.length === 0) {
      pendingGroup = null;
      return;
    }

    items.push({
      kind: 'tool_group',
      id: `runtime-tool-group-${pendingGroup.toolUses[0]!.id}`,
      groupType: pendingGroup.groupType,
      toolUses: [...pendingGroup.toolUses],
      groupLabel: buildCombinedToolGroupLabel(pendingGroup.toolUses, resultMap),
    });
    pendingGroup = null;
  };

  for (const event of orderedRuntimeEvents) {
    if (event.kind === 'tool_use') {
      toolUseIds.add(event.toolCallId);
      toolUseByToolCallId.set(event.toolCallId, event);

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

  for (const event of orderedRuntimeEvents) {
    if (event.kind === 'tool_use') {
      if (event.parentToolCallId && toolUseIds.has(event.parentToolCallId)) {
        continue;
      }

      if (!pendingGroup) {
        flushToolGroup();
        pendingGroup = {
          groupType: classifyToolGroupType(event),
          toolUses: [event],
        };
      } else {
        pendingGroup.toolUses.push(event);
      }
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

  return {
    items,
    orderedRuntimeEvents,
    resultMap,
    approvalsByToolCallId,
    questionsByToolCallId,
    childToolUsesByParent,
    toolUseByToolCallId,
  };
};

export const buildRuntimeToolStreamModel = buildRuntimeEventRenderModel;
