import type { RuntimeSkillDefinition } from '../skills/runtimeSkillTypes.ts';
import type { RuntimeMcpToolCall } from '../mcp/runtimeMcpTypes.ts';

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
