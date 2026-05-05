import assert from 'node:assert/strict';
import test from 'node:test';

const loadLifecycle = async () =>
  import(`../../src/modules/ai/runtime/dispatch/runtimeCapabilityLifecycle.ts?test=${Date.now()}`);

test('runtime capability lifecycle builds skill activation descriptors', async () => {
  const {
    buildSkillActivationLifecycleDescriptor,
    buildSkillDiscoveryLifecycleDescriptor,
    buildSkillLoadLifecycleDescriptor,
    buildCapabilityApprovalLifecycleDescriptor,
    buildSkillHookLifecycleDescriptor,
    buildMemoryReadLifecycleDescriptor,
    buildMemoryRollbackLifecycleDescriptor,
  } = await loadLifecycle();

  const descriptor = buildSkillActivationLifecycleDescriptor({
    sourceId: 'skill_1',
    skill: {
      id: 'requirements',
      name: 'Requirements',
      description: 'Clarify scope first',
      whenToUse: 'Before implementation',
      prompt: 'Help write a spec',
      executionContext: 'inline',
      allowedTools: ['view'],
      userInvocable: true,
      modelInvocable: true,
      source: 'bundled',
    },
    invocationKind: 'tag',
    prompt: 'Please use requirements',
  });

  assert.equal(descriptor.toolName, 'skill_activate');
  assert.equal(descriptor.replayEventType, 'skill_activated');
  assert.equal(descriptor.toolInput.skillId, 'requirements');
  assert.match(descriptor.timelineSummary, /Skill activated: Requirements/);
  assert.match(descriptor.output, /Activated skill: Requirements/);

  const discovery = buildSkillDiscoveryLifecycleDescriptor({
    toolCallId: 'skill_discover_1',
    discoveredSkills: [
      { id: 'repo-skill', name: 'Repo Skill', source: 'project' },
      { id: 'local-skill', name: 'Local Skill', source: 'local' },
    ],
  });
  const load = buildSkillLoadLifecycleDescriptor({
    toolCallId: 'skill_load_1',
    loadedSkills: [
      { id: 'repo-skill', name: 'Repo Skill', source: 'project', executionContext: 'inline' },
    ],
  });

  assert.equal(discovery.toolName, 'skill_discover');
  assert.equal(discovery.replayEventType, 'skills_discovered');
  assert.match(discovery.timelineSummary, /Skills discovered: 2/);
  assert.match(discovery.output, /Repo Skill/);
  assert.equal(load.toolName, 'skill_load');
  assert.equal(load.replayEventType, 'skills_loaded');
  assert.match(load.timelineSummary, /Skills loaded: 1/);
  assert.match(load.output, /Repo Skill/);

  const approvalRequested = buildCapabilityApprovalLifecycleDescriptor({
    approvalId: 'approval_1',
    actionType: 'mcp_tool_call',
    riskLevel: 'medium',
    summary: 'Allow MCP inspect',
    status: 'pending',
    toolCallId: 'tool_1',
  });
  const approvalApproved = buildCapabilityApprovalLifecycleDescriptor({
    approvalId: 'approval_1',
    actionType: 'mcp_tool_call',
    riskLevel: 'medium',
    summary: 'Allow MCP inspect',
    status: 'approved',
    toolCallId: 'tool_1',
  });

  assert.equal(approvalRequested.toolName, 'capability_approval');
  assert.equal(approvalRequested.replayEventType, 'approval_requested');
  assert.match(approvalRequested.timelineSummary, /Approval required: Allow MCP inspect/);
  assert.match(approvalRequested.replayPayload, /"toolCallId":"tool_1"/);
  assert.equal(approvalApproved.replayEventType, 'approval_approved');
  assert.match(approvalApproved.timelineSummary, /Approval approved: Allow MCP inspect/);

  const hookCompleted = buildSkillHookLifecycleDescriptor({
    toolCallId: 'skill_hook_1',
    skillId: 'requirements',
    skillName: 'Requirements',
    eventName: 'PreToolUse',
    toolName: 'view',
    matcher: 'view',
    command: 'echo before view',
    status: 'completed',
  });
  const hookFailed = buildSkillHookLifecycleDescriptor({
    toolCallId: 'skill_hook_2',
    skillId: 'requirements',
    skillName: 'Requirements',
    eventName: 'PostToolUse',
    toolName: 'edit',
    matcher: '*',
    command: 'exit 1',
    status: 'failed',
    error: 'Command failed',
  });

  assert.equal(hookCompleted.toolName, 'skill_hook');
  assert.equal(hookCompleted.replayEventType, 'skill_hook_completed');
  assert.match(hookCompleted.timelineSummary, /Skill hook completed: Requirements/);
  assert.match(hookCompleted.output, /echo before view/);
  assert.equal(hookFailed.replayEventType, 'skill_hook_failed');
  assert.match(hookFailed.timelineSummary, /Skill hook failed: Requirements/);
  assert.match(hookFailed.output, /Command failed/);

  const memoryRead = buildMemoryReadLifecycleDescriptor({
    threadId: 'thread_1',
    memoryEntries: [
      { id: 'memory_1', title: 'UI baseline', kind: 'projectFact' },
      { id: 'memory_2', title: 'Answer briefly', kind: 'userPreference' },
    ],
  });
  const memoryRollback = buildMemoryRollbackLifecycleDescriptor({
    threadId: 'thread_1',
    runId: 'run_1',
    restoredPaths: ['src/app.tsx', 'docs/spec.md'],
    removedRunIds: ['run_1', 'run_2'],
  });

  assert.equal(memoryRead.toolName, 'memory_read');
  assert.equal(memoryRead.replayEventType, 'memory_read');
  assert.match(memoryRead.timelineSummary, /Memory read: 2 entries/);
  assert.match(memoryRead.output, /UI baseline/);
  assert.equal(memoryRollback.toolName, 'memory_rollback');
  assert.equal(memoryRollback.replayEventType, 'memory_rollback');
  assert.match(memoryRollback.timelineSummary, /Memory rollback: 2 paths restored/);
  assert.match(memoryRollback.output, /src\/app\.tsx/);
});

test('runtime capability lifecycle builds memory write descriptors', async () => {
  const { buildMemoryWriteLifecycleDescriptor } = await loadLifecycle();

  const descriptor = buildMemoryWriteLifecycleDescriptor({
    entryId: 'memory_1',
    title: 'Answer briefly',
    kind: 'userPreference',
    action: 'save',
  });

  assert.equal(descriptor.replayEventType, 'memory_saved');
  assert.match(descriptor.timelineSummary, /Memory saved: Answer briefly/);
  assert.match(descriptor.replaySummary, /Memory saved: Answer briefly/);
  assert.match(descriptor.replayPayload, /"entryId":"memory_1"/);
  assert.match(descriptor.replayPayload, /"action":"save"/);
});

test('runtime capability lifecycle builds mcp start and outcome descriptors', async () => {
  const { buildMcpLifecycleStartDescriptor, buildMcpLifecycleOutcomeDescriptor } =
    await loadLifecycle();

  const start = buildMcpLifecycleStartDescriptor({
    toolCallId: 'mcp_1',
    serverId: 'goodnight-skills',
    toolName: 'list-skills',
    argumentsText: '',
  });
  const done = buildMcpLifecycleOutcomeDescriptor({
    id: 'call_1',
    threadId: 'thread_1',
    serverId: 'goodnight-skills',
    toolName: 'list-skills',
    status: 'completed',
    summary: 'Listed 3 skills',
    resultPreview: 'requirements\nprototype\npage',
    argumentsText: '',
    startedAt: 10,
    completedAt: 11,
    error: null,
  });

  assert.equal(start.toolName, 'goodnight-skills/list-skills');
  assert.match(start.timelineSummary, /MCP started: goodnight-skills\/list-skills/);
  assert.match(done.timelineSummary, /MCP completed: goodnight-skills\/list-skills/);
  assert.match(done.replaySummary, /MCP: goodnight-skills\/list-skills - Listed 3 skills/);
  assert.equal(done.replayEventType, 'mcp_completed');
  assert.match(done.output, /requirements/);
});
