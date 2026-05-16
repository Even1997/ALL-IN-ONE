// 文件作用：生命周期描述归一层，位于运行时事件分发层。
// 所在链路：负责统一记录过程事件，并提供可回放的结构。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import type { RuntimeSkillDefinition } from '../skills/runtimeSkillTypes.ts';
// 这个文件负责把不同能力来源的执行事实统一整理成生命周期描述符。
// 这些描述符会被 timeline、replay、消息输出等多个前端面复用。
// 如果你在排查“为什么某个能力结果显示成这句文案”，先看这里。
import type { RuntimeMcpToolCall } from '../mcp/runtimeMcpTypes.ts';

// 这一层把不同能力来源的执行事实，统一压成 timeline / replay / 输出文案都能共用的 descriptor。
// 如果你在查“为什么聊天里是这句提示”“为什么 replay 里显示成这个事件名”，通常从这里找。
export type RuntimeLifecycleDescriptor = {
  toolCallId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  timelineSummary: string;
  replaySummary: string;
  replayEventType: string;
  replayPayload: string;
  output: string;
};

const MEMORY_ACTION_LABEL: Record<'save' | 'overwrite' | 'rename', string> = {
  save: 'saved',
  overwrite: 'overwritten',
  rename: 'saved as renamed copy',
};

// skill 激活本身也被当作一个能力生命周期事件，
// 这样 timeline / replay 可以记录“本轮为什么开始带着某个 skill 运行”。
export const buildSkillActivationLifecycleDescriptor = (input: {
  sourceId: string;
  skill: Pick<RuntimeSkillDefinition, 'id' | 'name' | 'source' | 'executionContext'>;
  invocationKind: 'slash' | 'tag';
  prompt: string;
}): RuntimeLifecycleDescriptor => ({
  toolCallId: input.sourceId,
  toolName: 'skill_activate',
  toolInput: {
    skillId: input.skill.id,
    name: input.skill.name,
    source: input.skill.source,
    executionContext: input.skill.executionContext,
    invocationKind: input.invocationKind,
  },
  timelineSummary: `Skill activated: ${input.skill.name}`,
  replaySummary: `Skill: ${input.skill.name}`,
  replayEventType: 'skill_activated',
  replayPayload: JSON.stringify({
    kind: 'skill_activation_v1',
    skillId: input.skill.id,
    name: input.skill.name,
    source: input.skill.source,
    executionContext: input.skill.executionContext,
    invocationKind: input.invocationKind,
    promptPreview: input.prompt.slice(0, 240),
  }),
  output: `Activated skill: ${input.skill.name}`,
});

// 发现技能和加载技能是两个不同阶段：
// discover 解决“看见哪些技能”，load 解决“本轮实际把哪些技能装进 runtime 提示词”。
export const buildSkillDiscoveryLifecycleDescriptor = (input: {
  toolCallId: string;
  discoveredSkills: Array<Pick<RuntimeSkillDefinition, 'id' | 'name' | 'source'>>;
}): RuntimeLifecycleDescriptor => ({
  toolCallId: input.toolCallId,
  toolName: 'skill_discover',
  toolInput: {
    count: input.discoveredSkills.length,
    skills: input.discoveredSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      source: skill.source,
    })),
  },
  timelineSummary: `Skills discovered: ${input.discoveredSkills.length}`,
  replaySummary: `Skills discovered: ${input.discoveredSkills.length}`,
  replayEventType: 'skills_discovered',
  replayPayload: JSON.stringify({
    kind: 'skill_discovery_v1',
    count: input.discoveredSkills.length,
    skills: input.discoveredSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      source: skill.source,
    })),
  }),
  output: input.discoveredSkills.length
    ? `Discovered skills: ${input.discoveredSkills.map((skill) => skill.name).join(', ')}`
    : 'Discovered skills: none',
});

export const buildSkillLoadLifecycleDescriptor = (input: {
  toolCallId: string;
  loadedSkills: Array<
    Pick<RuntimeSkillDefinition, 'id' | 'name' | 'source' | 'executionContext'>
  >;
}): RuntimeLifecycleDescriptor => ({
  toolCallId: input.toolCallId,
  toolName: 'skill_load',
  toolInput: {
    count: input.loadedSkills.length,
    skills: input.loadedSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      source: skill.source,
      executionContext: skill.executionContext,
    })),
  },
  timelineSummary: `Skills loaded: ${input.loadedSkills.length}`,
  replaySummary: `Skills loaded: ${input.loadedSkills.length}`,
  replayEventType: 'skills_loaded',
  replayPayload: JSON.stringify({
    kind: 'skill_load_v1',
    count: input.loadedSkills.length,
    skills: input.loadedSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      source: skill.source,
      executionContext: skill.executionContext,
    })),
  }),
  output: input.loadedSkills.length
    ? `Loaded skills: ${input.loadedSkills.map((skill) => skill.name).join(', ')}`
    : 'Loaded skills: none',
});

// approval 也统一套用 descriptor，保证它能像普通 capability 一样进入 timeline / replay。
export const buildCapabilityApprovalLifecycleDescriptor = (input: {
  approvalId: string;
  actionType: string;
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
  status: 'pending' | 'approved' | 'denied';
  toolCallId?: string | null;
}): RuntimeLifecycleDescriptor => {
  const statusLabel =
    input.status === 'approved'
      ? 'approved'
      : input.status === 'denied'
        ? 'denied'
        : 'required';
  const replayEventType =
    input.status === 'approved'
      ? 'approval_approved'
      : input.status === 'denied'
        ? 'approval_denied'
        : 'approval_requested';

  return {
    toolCallId: input.approvalId,
    toolName: 'capability_approval',
    toolInput: {
      approvalId: input.approvalId,
      actionType: input.actionType,
      riskLevel: input.riskLevel,
      toolCallId: input.toolCallId || null,
    },
    timelineSummary: `Approval ${statusLabel}: ${input.summary}`,
    replaySummary: `Approval ${statusLabel}: ${input.summary}`,
    replayEventType,
    replayPayload: JSON.stringify({
      kind: 'approval_lifecycle_v1',
      approvalId: input.approvalId,
      actionType: input.actionType,
      riskLevel: input.riskLevel,
      summary: input.summary,
      status: input.status,
      toolCallId: input.toolCallId || null,
    }),
    output: `Approval ${statusLabel}: ${input.summary}`,
  };
};

// skill hook 是围绕工具调用前后执行的壳层动作；
// 这里记录的不是真正工具输出，而是 hook 自己的生命周期结果。
export const buildSkillHookLifecycleDescriptor = (input: {
  toolCallId: string;
  skillId: string;
  skillName: string;
  eventName: 'PreToolUse' | 'PostToolUse';
  toolName: string;
  matcher: string;
  command: string;
  status: 'completed' | 'failed';
  error?: string | null;
}): RuntimeLifecycleDescriptor => ({
  toolCallId: input.toolCallId,
  toolName: 'skill_hook',
  toolInput: {
    skillId: input.skillId,
    eventName: input.eventName,
    toolName: input.toolName,
    matcher: input.matcher,
    command: input.command,
  },
  timelineSummary:
    input.status === 'failed'
      ? `Skill hook failed: ${input.skillName}`
      : `Skill hook completed: ${input.skillName}`,
  replaySummary:
    input.status === 'failed'
      ? `Skill hook failed: ${input.skillName}`
      : `Skill hook completed: ${input.skillName}`,
  replayEventType: input.status === 'failed' ? 'skill_hook_failed' : 'skill_hook_completed',
  replayPayload: JSON.stringify({
    kind: 'skill_hook_v1',
    skillId: input.skillId,
    skillName: input.skillName,
    eventName: input.eventName,
    toolName: input.toolName,
    matcher: input.matcher,
    command: input.command,
    status: input.status,
    error: input.error || null,
  }),
  output:
    input.status === 'failed'
      ? `Skill hook failed: ${input.skillName}\n\n${input.error || input.command}`
      : `Skill hook completed: ${input.skillName}\n\n${input.command}`,
});

export const buildMemoryWriteLifecycleDescriptor = (input: {
  entryId: string;
  title: string;
  kind: 'projectFact' | 'userPreference';
  action: 'save' | 'overwrite' | 'rename';
}): Omit<RuntimeLifecycleDescriptor, 'toolCallId'> => {
  const actionLabel = MEMORY_ACTION_LABEL[input.action];
  return {
    toolName: 'memory_write',
    toolInput: {
      entryId: input.entryId,
      title: input.title,
      kind: input.kind,
      action: input.action,
    },
    timelineSummary: `Memory ${actionLabel}: ${input.title}`,
    replaySummary: `Memory ${actionLabel}: ${input.title}`,
    replayEventType: 'memory_saved',
    replayPayload: JSON.stringify({
      kind: 'memory_write_v1',
      entryId: input.entryId,
      title: input.title,
      memoryKind: input.kind,
      action: input.action,
    }),
    output: `Memory ${actionLabel}: ${input.title}`,
  };
};

export const buildMemoryReadLifecycleDescriptor = (input: {
  threadId: string;
  memoryEntries: Array<{
    id: string;
    title?: string;
    kind?: 'projectFact' | 'userPreference';
  }>;
}): RuntimeLifecycleDescriptor => ({
  toolCallId: `memory_read_${input.threadId}_${input.memoryEntries.length}`,
  toolName: 'memory_read',
  toolInput: {
    threadId: input.threadId,
    count: input.memoryEntries.length,
    entryIds: input.memoryEntries.map((entry) => entry.id),
  },
  timelineSummary: `Memory read: ${input.memoryEntries.length} entries`,
  replaySummary: `Memory read: ${input.memoryEntries.length} entries`,
  replayEventType: 'memory_read',
  replayPayload: JSON.stringify({
    kind: 'memory_read_v1',
    threadId: input.threadId,
    count: input.memoryEntries.length,
    entries: input.memoryEntries.map((entry) => ({
      id: entry.id,
      title: entry.title || '',
      kind: entry.kind || null,
    })),
  }),
  output: input.memoryEntries.length
    ? `Memory read: ${input.memoryEntries.map((entry) => entry.title || entry.id).join(', ')}`
    : 'Memory read: none',
});

export const buildMemoryRollbackLifecycleDescriptor = (input: {
  threadId: string;
  runId: string;
  restoredPaths: string[];
  removedRunIds: string[];
}): RuntimeLifecycleDescriptor => ({
  toolCallId: `memory_rollback_${input.runId}`,
  toolName: 'memory_rollback',
  toolInput: {
    threadId: input.threadId,
    runId: input.runId,
    restoredPaths: input.restoredPaths,
    removedRunIds: input.removedRunIds,
  },
  timelineSummary: `Memory rollback: ${input.restoredPaths.length} paths restored`,
  replaySummary: `Memory rollback: ${input.restoredPaths.length} paths restored`,
  replayEventType: 'memory_rollback',
  replayPayload: JSON.stringify({
    kind: 'memory_rollback_v1',
    threadId: input.threadId,
    runId: input.runId,
    restoredPaths: input.restoredPaths,
    removedRunIds: input.removedRunIds,
  }),
  output: input.restoredPaths.length
    ? `Memory rollback restored: ${input.restoredPaths.join(', ')}`
    : 'Memory rollback restored: none',
});

export const buildMcpLifecycleStartDescriptor = (input: {
  toolCallId: string;
  serverId: string;
  toolName: string;
  argumentsText: string;
}): RuntimeLifecycleDescriptor => ({
  toolCallId: input.toolCallId,
  toolName: `${input.serverId}/${input.toolName}`,
  toolInput: {
    serverId: input.serverId,
    toolName: input.toolName,
    arguments: input.argumentsText,
  },
  timelineSummary: `MCP started: ${input.serverId}/${input.toolName}`,
  replaySummary: `MCP: ${input.serverId}/${input.toolName}`,
  replayEventType: 'mcp_started',
  replayPayload: JSON.stringify({
    kind: 'mcp_call_v1',
    serverId: input.serverId,
    toolName: input.toolName,
    argumentsText: input.argumentsText,
  }),
  output: `Running MCP ${input.serverId}/${input.toolName}`,
});

export const buildMcpLifecycleOutcomeDescriptor = (
  toolCall: RuntimeMcpToolCall
): RuntimeLifecycleDescriptor => {
  const output = toolCall.error
    ? `MCP ${toolCall.serverId}/${toolCall.toolName} 调用失败。\n\n${toolCall.error}`
    : toolCall.resultPreview.trim()
      ? `MCP ${toolCall.serverId}/${toolCall.toolName}\n\n${toolCall.summary}\n\n${toolCall.resultPreview.trim()}`
      : `MCP ${toolCall.serverId}/${toolCall.toolName} 已完成。\n\n${toolCall.summary}`;

  return {
    toolCallId: toolCall.id,
    toolName: `${toolCall.serverId}/${toolCall.toolName}`,
    toolInput: {
      serverId: toolCall.serverId,
      toolName: toolCall.toolName,
      arguments: toolCall.argumentsText,
    },
    timelineSummary: toolCall.error
      ? `MCP failed: ${toolCall.serverId}/${toolCall.toolName}`
      : `MCP completed: ${toolCall.serverId}/${toolCall.toolName}`,
    replaySummary: `MCP: ${toolCall.serverId}/${toolCall.toolName} - ${toolCall.summary}`,
    replayEventType: toolCall.error ? 'mcp_failed' : 'mcp_completed',
    replayPayload: `${toolCall.serverId}/${toolCall.toolName}: ${toolCall.summary}`,
    output,
  };
};
