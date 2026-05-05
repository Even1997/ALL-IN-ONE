import assert from 'node:assert/strict';
import test from 'node:test';

const loadExecutionGraph = async () =>
  import(`../../src/modules/ai/runtime/execution/agentExecutionGraph.ts?test=${Date.now()}`);

test('execution graph creates stable task and root run ids', async () => {
  const {
    createExecutionTaskId,
    createRootExecutionRunId,
    createExecutionTaskRecord,
    createExecutionRunRecord,
    deriveTaskStatusFromRuns,
  } = await loadExecutionGraph();

  const taskId = createExecutionTaskId('run_123');
  const rootRunId = createRootExecutionRunId(taskId);

  assert.equal(taskId, 'task_run_123');
  assert.equal(rootRunId, 'run_task_run_123_root');

  const task = createExecutionTaskRecord({
    runId: 'run_123',
    threadId: 'thread_1',
    turnId: 'turn_1',
    providerId: 'codex',
    title: 'Implement the feature',
    prompt: 'Ship Phase 3',
    summary: 'Queued for execution',
  });
  const rootRun = createExecutionRunRecord({
    id: rootRunId,
    threadId: 'thread_1',
    taskId: task.id,
    turnId: 'turn_1',
    providerId: 'codex',
    kind: 'turn',
    title: 'Root run',
    summary: 'Running',
    status: 'running',
  });

  assert.equal(task.rootRunId, rootRunId);
  assert.equal(deriveTaskStatusFromRuns(task, [rootRun]).status, 'running');
  assert.equal(
    deriveTaskStatusFromRuns(task, [{ ...rootRun, status: 'completed', completedAt: Date.now() }]).status,
    'completed'
  );
});

test('workflow execution graph creates parented package, stage, and skill runs', async () => {
  const { syncWorkflowExecutionGraph } = await loadExecutionGraph();

  const graph = syncWorkflowExecutionGraph([], [], {
    threadId: 'thread_workflow',
    taskId: 'task_workflow',
    turnId: 'turn_workflow',
    parentRunId: 'run_task_workflow_root',
    workflowRuns: [
      {
        targetPackage: 'prototype',
        status: 'running',
        currentStage: 'wireframes',
        completedStages: ['requirements_spec'],
        stageSummaries: {
          requirements_spec: 'Requirements locked',
          wireframes: 'Wireframes are in progress',
        },
        skillExecutions: [
          {
            id: 'skill_1',
            stage: 'wireframes',
            skill: 'wireframe_skill',
            provider: 'codex',
            model: 'gpt-5.5',
            status: 'running',
            retries: 0,
            summary: 'Building compact panel wireframes',
          },
        ],
      },
    ],
  });

  const packageRun = graph.runs.find((run) => run.kind === 'workflow_package');
  const stageRuns = graph.runs.filter((run) => run.kind === 'workflow_stage');
  const skillRun = graph.agentRuns.find((run) => run.kind === 'workflow_skill');

  assert.ok(packageRun);
  assert.equal(packageRun.parentRunId, 'run_task_workflow_root');
  assert.equal(stageRuns.length, 2);
  assert.ok(stageRuns.some((run) => run.title === 'requirements_spec' && run.status === 'completed'));
  assert.ok(stageRuns.some((run) => run.title === 'wireframes' && run.status === 'running'));
  assert.ok(skillRun);
  assert.equal(skillRun.runId, stageRuns.find((run) => run.title === 'wireframes')?.id);
  assert.equal(skillRun.status, 'running');
});

test('team execution graph creates parented team, phase, and member runs', async () => {
  const { syncTeamExecutionGraph } = await loadExecutionGraph();

  const graph = syncTeamExecutionGraph([], [], {
    threadId: 'thread_team',
    taskId: 'task_team',
    turnId: 'turn_team',
    parentRunId: 'run_task_team_root',
    teamRun: {
      id: 'team_run_1',
      threadId: 'thread_team',
      turnId: 'turn_team',
      providerId: 'team',
      summary: 'Multi-agent rollout',
      strategy: 'Split work by phase',
      status: 'running',
      phases: [
        {
          id: 'implementation',
          title: 'Implementation',
          summary: 'Main execution',
          goal: 'Ship the feature',
          status: 'running',
          startedAt: 10,
          completedAt: null,
          taskIds: ['task_impl_1'],
        },
      ],
      members: [
        {
          id: 'member_1',
          threadId: 'thread_team',
          parentTurnId: 'turn_team',
          taskId: 'task_impl_1',
          phaseId: 'implementation',
          role: 'implementer',
          agentId: 'codex',
          title: 'Implement event graph',
          prompt: 'Build the execution hierarchy',
          status: 'running',
          startedAt: 12,
          completedAt: null,
          result: '',
          error: null,
          dependsOn: [],
          changedPaths: ['src/components/workspace/AIChat.tsx'],
        },
      ],
      finalSummary: '',
      changedPaths: [],
      createdAt: 1,
      updatedAt: 2,
    },
  });

  const teamRun = graph.runs.find((run) => run.kind === 'team');
  const phaseRun = graph.runs.find((run) => run.kind === 'team_phase');
  const memberRun = graph.agentRuns.find((run) => run.kind === 'team_member');

  assert.ok(teamRun);
  assert.equal(teamRun.parentRunId, 'run_task_team_root');
  assert.ok(phaseRun);
  assert.equal(phaseRun.parentRunId, teamRun.id);
  assert.ok(memberRun);
  assert.equal(memberRun.runId, phaseRun.id);
  assert.equal(memberRun.agentId, 'codex');
});
