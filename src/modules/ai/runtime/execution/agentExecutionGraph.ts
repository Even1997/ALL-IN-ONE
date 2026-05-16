// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type {
  AgentExecutionAgentRunRecord,
  AgentExecutionAgentRunStatus,
  AgentExecutionRunRecord,
  AgentExecutionRunStatus,
  AgentExecutionTaskRecord,
  AgentExecutionTaskStatus,
  AgentProviderId,
} from '../agentRuntimeTypes.ts';
import type { AgentTeamRunRecord } from '../teams/teamTypes.ts';

const sortByUpdatedAt = <T extends { updatedAt: number }>(items: T[]) =>
  [...items].sort((left, right) => right.updatedAt - left.updatedAt);

const upsertById = <T extends { id: string }>(items: T[], next: T) => {
  const index = items.findIndex((item) => item.id === next.id);
  if (index < 0) {
    return [...items, next];
  }
  const copy = [...items];
  copy[index] = next;
  return copy;
};

const toTaskStatus = (
  status: AgentExecutionRunStatus | AgentExecutionAgentRunStatus
): AgentExecutionTaskStatus =>
  status === 'planning' || status === 'queued' || status === 'running'
    ? status
    : status === 'blocked'
      ? 'blocked'
      : status === 'failed'
        ? 'failed'
        : 'completed';

const toTeamRunStatus = (status: AgentTeamRunRecord['status']): AgentExecutionRunStatus =>
  status === 'planning' ? 'planning' : status === 'running' ? 'running' : status === 'failed' ? 'failed' : 'completed';

const toTeamAgentStatus = (
  status: AgentTeamRunRecord['members'][number]['status']
): AgentExecutionAgentRunStatus =>
  status === 'running' ? 'running' : status === 'failed' ? 'failed' : status === 'completed' ? 'completed' : 'pending';

export const createExecutionTaskId = (runId: string) => `task_${runId}`;

export const createRootExecutionRunId = (taskId: string) => `run_${taskId}_root`;

export const createExecutionTaskRecord = (input: {
  runId: string;
  threadId: string;
  turnId: string;
  providerId: AgentProviderId;
  title: string;
  prompt: string;
  summary: string;
  status?: AgentExecutionTaskStatus;
  createdAt?: number;
}): AgentExecutionTaskRecord => {
  const createdAt = input.createdAt || Date.now();
  return {
    id: createExecutionTaskId(input.runId),
    threadId: input.threadId,
    turnId: input.turnId,
    providerId: input.providerId,
    title: input.title,
    prompt: input.prompt,
    summary: input.summary,
    status: input.status || 'queued',
    rootRunId: createRootExecutionRunId(createExecutionTaskId(input.runId)),
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
  };
};

export const createExecutionRunRecord = (input: {
  id: string;
  threadId: string;
  taskId: string;
  turnId: string;
  parentRunId?: string | null;
  providerId: AgentProviderId;
  kind: AgentExecutionRunRecord['kind'];
  title: string;
  summary: string;
  status: AgentExecutionRunStatus;
  createdAt?: number;
}): AgentExecutionRunRecord => {
  const createdAt = input.createdAt || Date.now();
  return {
    id: input.id,
    threadId: input.threadId,
    taskId: input.taskId,
    turnId: input.turnId,
    parentRunId: input.parentRunId ?? null,
    providerId: input.providerId,
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    status: input.status,
    createdAt,
    updatedAt: createdAt,
    completedAt:
      input.status === 'completed' || input.status === 'failed' || input.status === 'blocked'
        ? createdAt
        : null,
  };
};

export const patchExecutionRunStatus = (
  run: AgentExecutionRunRecord,
  status: AgentExecutionRunStatus,
  summary?: string
): AgentExecutionRunRecord => ({
  ...run,
  status,
  summary: summary ?? run.summary,
  updatedAt: Date.now(),
  completedAt:
    status === 'completed' || status === 'failed' || status === 'blocked'
      ? run.completedAt || Date.now()
      : null,
});

export const patchExecutionTaskStatus = (
  task: AgentExecutionTaskRecord,
  status: AgentExecutionTaskStatus,
  summary?: string
): AgentExecutionTaskRecord => ({
  ...task,
  status,
  summary: summary ?? task.summary,
  updatedAt: Date.now(),
  completedAt:
    status === 'completed' || status === 'failed' || status === 'blocked'
      ? task.completedAt || Date.now()
      : null,
});

export const createExecutionAgentRunRecord = (input: {
  id: string;
  threadId: string;
  taskId: string;
  runId: string;
  parentAgentRunId?: string | null;
  kind: AgentExecutionAgentRunRecord['kind'];
  agentId: string;
  role: string;
  title: string;
  summary: string;
  status: AgentExecutionAgentRunStatus;
  createdAt?: number;
}): AgentExecutionAgentRunRecord => {
  const createdAt = input.createdAt || Date.now();
  return {
    id: input.id,
    threadId: input.threadId,
    taskId: input.taskId,
    runId: input.runId,
    parentAgentRunId: input.parentAgentRunId ?? null,
    kind: input.kind,
    agentId: input.agentId,
    role: input.role,
    title: input.title,
    summary: input.summary,
    status: input.status,
    createdAt,
    updatedAt: createdAt,
    completedAt:
      input.status === 'completed' || input.status === 'failed' || input.status === 'blocked'
        ? createdAt
        : null,
  };
};

export const syncTeamExecutionGraph = (
  currentRuns: AgentExecutionRunRecord[],
  currentAgentRuns: AgentExecutionAgentRunRecord[],
  input: {
    threadId: string;
    taskId: string;
    turnId: string;
    parentRunId: string;
    teamRun: AgentTeamRunRecord;
  }
) => {
  let runs = [...currentRuns];
  let agentRuns = [...currentAgentRuns];

  const teamExecutionRunId = `run_${input.taskId}_team_${input.teamRun.id}`;
  runs = upsertById(
    runs,
    createExecutionRunRecord({
      id: teamExecutionRunId,
      threadId: input.threadId,
      taskId: input.taskId,
      turnId: input.turnId,
      parentRunId: input.parentRunId,
      providerId: 'team',
      kind: 'team',
      title: input.teamRun.summary,
      summary: input.teamRun.finalSummary || input.teamRun.strategy || input.teamRun.summary,
      status: toTeamRunStatus(input.teamRun.status),
      createdAt: input.teamRun.createdAt,
    })
  );

  for (const phase of input.teamRun.phases) {
    const phaseRunId = `run_${teamExecutionRunId}_${phase.id}`;
    runs = upsertById(
      runs,
      createExecutionRunRecord({
        id: phaseRunId,
        threadId: input.threadId,
        taskId: input.taskId,
        turnId: input.turnId,
        parentRunId: teamExecutionRunId,
        providerId: 'team',
        kind: 'team_phase',
        title: phase.title,
        summary: phase.summary || phase.goal || phase.title,
        status: phase.status === 'failed' ? 'failed' : phase.status === 'completed' ? 'completed' : phase.status === 'running' ? 'running' : 'queued',
        createdAt: phase.startedAt || input.teamRun.createdAt,
      })
    );

    for (const member of input.teamRun.members.filter((item) => item.phaseId === phase.id)) {
      agentRuns = upsertById(
        agentRuns,
        createExecutionAgentRunRecord({
          id: `agent_run_${phaseRunId}_${member.id}`,
          threadId: input.threadId,
          taskId: input.taskId,
          runId: phaseRunId,
          kind: 'team_member',
          agentId: member.agentId,
          role: member.role,
          title: member.title,
          summary: member.error || member.result || member.prompt,
          status: toTeamAgentStatus(member.status),
          createdAt: member.startedAt || input.teamRun.createdAt,
        })
      );
    }
  }

  return {
    runs: sortByUpdatedAt(runs),
    agentRuns: sortByUpdatedAt(agentRuns),
  };
};

export const createLocalAgentExecutionRunId = (taskId: string, agentId: string) =>
  `run_${taskId}_local_agent_${agentId}`;

export const createLocalAgentExecutionAgentRunId = (runId: string, agentId: string) =>
  `agent_run_${runId}_${agentId}`;

export const deriveTaskStatusFromRuns = (
  task: AgentExecutionTaskRecord,
  runs: AgentExecutionRunRecord[]
): AgentExecutionTaskRecord => {
  const taskRuns = runs.filter((run) => run.taskId === task.id);
  if (taskRuns.some((run) => run.status === 'failed')) {
    return patchExecutionTaskStatus(task, 'failed');
  }
  if (taskRuns.some((run) => run.status === 'blocked')) {
    return patchExecutionTaskStatus(task, 'blocked');
  }
  if (taskRuns.length > 0 && taskRuns.every((run) => run.status === 'completed')) {
    return patchExecutionTaskStatus(task, 'completed');
  }
  if (taskRuns.some((run) => run.status === 'running')) {
    return patchExecutionTaskStatus(task, 'running');
  }
  if (taskRuns.some((run) => run.status === 'planning')) {
    return patchExecutionTaskStatus(task, 'planning');
  }
  return patchExecutionTaskStatus(task, toTaskStatus(task.status));
};
