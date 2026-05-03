import type { ChatAgentId, LocalAgentCommandResult } from '../../chat/chatAgents.ts';
import type { AgentMemoryEntry } from '../agentRuntimeTypes.ts';
import type { AgentContextConversationMessage } from '../context/agentContextTypes.ts';
import { buildAgentTeamPlan } from './teamPlanner.ts';
import type {
  AgentTeamMemberRecord,
  AgentTeamPhaseId,
  AgentTeamPhaseRecord,
  AgentTeamRunRecord,
} from './teamTypes.ts';

const createTeamRunId = () => `team_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const createMemberId = (taskId: string) => `member_${taskId}_${Math.random().toString(36).slice(2, 8)}`;

const phaseOrder: AgentTeamPhaseId[] = [
  'product_architecture',
  'ui_interaction',
  'implementation',
  'qa_review',
];

const phaseTitleMap: Record<AgentTeamPhaseId, string> = {
  product_architecture: 'Product & Architecture',
  ui_interaction: 'UI & Interaction',
  implementation: 'Implementation',
  qa_review: 'QA & Review',
};

const buildCoordinatorPrompt = (input: {
  summary: string;
  strategy: string;
  phases: AgentTeamPhaseRecord[];
  members: AgentTeamMemberRecord[];
  originalPrompt: string;
}) =>
  [
    `Original request: ${input.originalPrompt}`,
    `Execution summary: ${input.summary}`,
    `Strategy: ${input.strategy}`,
    'Phase outcomes:',
    ...input.phases.map((phase) => `- ${phase.title}: ${phase.status} | ${phase.summary}`),
    'Member results:',
    ...input.members.map((member) =>
      [
        `- ${phaseTitleMap[member.phaseId]} / ${member.title} (${member.agentId}, ${member.status})`,
        member.error ? `Error: ${member.error}` : member.result || 'No result returned.',
      ].join('\n')
    ),
    'Write a final integrated answer that preserves the overall architecture, the UI interaction design, the implementation result, and the QA conclusion.',
  ].join('\n\n');

const selectExecutionAgent = (
  phaseId: AgentTeamPhaseId,
  preferredAgent: Extract<ChatAgentId, 'claude' | 'codex'>,
): Extract<ChatAgentId, 'claude' | 'codex'> => {
  if (phaseId === 'product_architecture' || phaseId === 'qa_review') {
    return preferredAgent === 'claude' ? 'codex' : 'claude';
  }

  return preferredAgent;
};

const buildMemberPrompt = (input: {
  taskPrompt: string;
  agentInstructions: string[];
  referenceFiles: Array<{ path: string; summary: string; content: string }>;
  memoryEntries: AgentMemoryEntry[];
  priorPhaseOutputs: string[];
}) =>
  [
    input.agentInstructions.length > 0 ? `Context labels:\n- ${input.agentInstructions.join('\n- ')}` : null,
    input.memoryEntries.length > 0
      ? `Relevant memory:\n${input.memoryEntries
          .slice(0, 6)
          .map((entry) => `- ${entry.title || entry.label}: ${entry.summary || entry.content}`)
          .join('\n')}`
      : null,
    input.referenceFiles.length > 0
      ? `Reference files:\n${input.referenceFiles
          .slice(0, 6)
          .map((file) => `- ${file.path}: ${file.summary}`)
          .join('\n')}`
      : null,
    input.priorPhaseOutputs.length > 0
      ? `Approved outputs from earlier phases:\n${input.priorPhaseOutputs.map((item) => `- ${item}`).join('\n')}`
      : null,
    input.taskPrompt,
  ]
    .filter((item): item is string => Boolean(item))
    .join('\n\n');

const emitUpdate = (
  teamRun: AgentTeamRunRecord,
  onTeamRunUpdate?: (teamRun: AgentTeamRunRecord) => void,
) => {
  onTeamRunUpdate?.({
    ...teamRun,
    phases: teamRun.phases.map((phase) => ({ ...phase, taskIds: [...phase.taskIds] })),
    members: teamRun.members.map((member) => ({ ...member, dependsOn: [...member.dependsOn] })),
  });
};

const setPhaseStatus = (
  teamRun: AgentTeamRunRecord,
  phaseId: AgentTeamPhaseId,
  status: AgentTeamPhaseRecord['status'],
) => {
  const phase = teamRun.phases.find((item) => item.id === phaseId);
  if (!phase) {
    return;
  }

  phase.status = status;
  if (status === 'running' && !phase.startedAt) {
    phase.startedAt = Date.now();
  }
  if ((status === 'completed' || status === 'failed') && !phase.completedAt) {
    phase.completedAt = Date.now();
  }
  teamRun.updatedAt = Date.now();
};

export type RunAgentTeamTurnInput = {
  projectId: string;
  projectName: string;
  threadId: string;
  turnId: string;
  userInput: string;
  projectRoot: string;
  preferredAgent: Extract<ChatAgentId, 'claude' | 'codex'>;
  contextWindowTokens: number;
  conversationHistory: AgentContextConversationMessage[];
  agentInstructions: string[];
  referenceFiles: Array<{ path: string; summary: string; content: string }>;
  memoryEntries: AgentMemoryEntry[];
  onTeamRunUpdate?: (teamRun: AgentTeamRunRecord) => void;
  runPrompt: (payload: {
    agent: string;
    projectRoot: string;
    prompt: string;
  }) => Promise<LocalAgentCommandResult>;
};

export type RunAgentTeamTurnResult = {
  teamRun: AgentTeamRunRecord;
  finalContent: string;
};

export async function runAgentTeamTurn(
  input: RunAgentTeamTurnInput,
): Promise<RunAgentTeamTurnResult> {
  const plan = buildAgentTeamPlan({
    projectName: input.projectName,
    userInput: input.userInput,
    conversationHistory: input.conversationHistory,
  });

  const now = Date.now();
  const teamRun: AgentTeamRunRecord = {
    id: createTeamRunId(),
    threadId: input.threadId,
    turnId: input.turnId,
    providerId: 'team',
    summary: plan.summary,
    strategy: plan.strategy,
    status: 'planning',
    phases: plan.phases.map((phase) => ({
      id: phase.id,
      title: phase.title,
      summary: phase.summary,
      goal: phase.goal,
      status: 'pending',
      startedAt: null,
      completedAt: null,
      taskIds: phase.tasks.map((task) => task.id),
    })),
    members: plan.phases.flatMap((phase) =>
      phase.tasks.map((task) => ({
        id: createMemberId(task.id),
        threadId: input.threadId,
        parentTurnId: input.turnId,
        taskId: task.id,
        phaseId: task.phaseId,
        role: task.role,
        agentId: selectExecutionAgent(task.phaseId, input.preferredAgent),
        title: task.title,
        prompt: task.prompt,
        status: 'pending',
        startedAt: null,
        completedAt: null,
        result: '',
        error: null,
        dependsOn: [...task.dependsOn],
      })),
    ),
    finalSummary: '',
    createdAt: now,
    updatedAt: now,
  };

  emitUpdate(teamRun, input.onTeamRunUpdate);
  teamRun.status = 'running';
  teamRun.updatedAt = Date.now();
  emitUpdate(teamRun, input.onTeamRunUpdate);

  const phaseOutputs = new Map<AgentTeamPhaseId, string[]>();

  const runMember = async (member: AgentTeamMemberRecord, priorPhaseOutputs: string[]) => {
    member.status = 'running';
    member.startedAt = Date.now();
    teamRun.updatedAt = Date.now();
    emitUpdate(teamRun, input.onTeamRunUpdate);

    try {
      const result = await input.runPrompt({
        agent: member.agentId,
        projectRoot: input.projectRoot,
        prompt: buildMemberPrompt({
          taskPrompt: member.prompt,
          agentInstructions: input.agentInstructions,
          referenceFiles: input.referenceFiles,
          memoryEntries: input.memoryEntries,
          priorPhaseOutputs,
        }),
      });

      if (!result.success) {
        throw new Error(result.error || `${member.agentId} agent failed.`);
      }

      member.status = 'completed';
      member.completedAt = Date.now();
      member.result = result.content.trim();
      member.error = null;
      teamRun.updatedAt = Date.now();
      emitUpdate(teamRun, input.onTeamRunUpdate);
    } catch (error) {
      member.status = 'failed';
      member.completedAt = Date.now();
      member.error = error instanceof Error ? error.message : String(error);
      teamRun.status = 'failed';
      teamRun.updatedAt = Date.now();
      emitUpdate(teamRun, input.onTeamRunUpdate);
    }
  };

  for (const phaseId of phaseOrder) {
    const phase = teamRun.phases.find((item) => item.id === phaseId);
    if (!phase) {
      continue;
    }

    setPhaseStatus(teamRun, phaseId, 'running');
    emitUpdate(teamRun, input.onTeamRunUpdate);

    const members = teamRun.members.filter((member) => member.phaseId === phaseId);
    const completedTaskIds = new Set<string>();
    const remainingMembers = new Set(members.map((member) => member.id));
    const priorPhaseOutputs = phaseOrder
      .slice(0, phaseOrder.indexOf(phaseId))
      .flatMap((priorPhaseId) => phaseOutputs.get(priorPhaseId) || []);

    while (remainingMembers.size > 0) {
      const readyMembers = members.filter(
        (member) =>
          remainingMembers.has(member.id) &&
          member.dependsOn.every((dependencyId) => completedTaskIds.has(dependencyId))
      );

      if (readyMembers.length === 0) {
        setPhaseStatus(teamRun, phaseId, 'failed');
        teamRun.status = 'failed';
        emitUpdate(teamRun, input.onTeamRunUpdate);
        break;
      }

      await Promise.all(readyMembers.map((member) => runMember(member, priorPhaseOutputs)));
      for (const member of readyMembers) {
        remainingMembers.delete(member.id);
        if (member.status === 'completed') {
          completedTaskIds.add(member.taskId);
        }
      }
    }

    const phaseFailed = members.some((member) => member.status === 'failed');
    if (phaseFailed) {
      setPhaseStatus(teamRun, phaseId, 'failed');
      teamRun.status = 'failed';
      emitUpdate(teamRun, input.onTeamRunUpdate);
    } else {
      setPhaseStatus(teamRun, phaseId, 'completed');
      phaseOutputs.set(
        phaseId,
        members
          .map((member) => member.result.trim())
          .filter((item) => item.length > 0),
      );
      emitUpdate(teamRun, input.onTeamRunUpdate);
    }

    if (teamRun.status === 'failed') {
      break;
    }
  }

  const finalContentResult = await input.runPrompt({
    agent: input.preferredAgent,
    projectRoot: input.projectRoot,
    prompt: buildCoordinatorPrompt({
      summary: plan.summary,
      strategy: plan.strategy,
      phases: teamRun.phases,
      members: teamRun.members,
      originalPrompt: input.userInput,
    }),
  });

  const finalContent = finalContentResult.success
    ? finalContentResult.content.trim()
    : [
        `Team execution summary: ${plan.summary}`,
        ...teamRun.phases.map((phase) => `${phase.title}: ${phase.status}`),
        ...teamRun.members.map((member) =>
          `${phaseTitleMap[member.phaseId]} / ${member.title}: ${member.error || member.result || 'No result returned.'}`
        ),
      ].join('\n\n');

  teamRun.finalSummary = finalContent;
  teamRun.status =
    teamRun.members.some((member) => member.status === 'failed') &&
    !teamRun.members.some((member) => member.status === 'completed')
      ? 'failed'
      : teamRun.status === 'failed'
        ? 'failed'
        : 'completed';
  teamRun.updatedAt = Date.now();
  emitUpdate(teamRun, input.onTeamRunUpdate);

  return {
    teamRun,
    finalContent,
  };
}
