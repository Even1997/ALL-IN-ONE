import type {
  RuntimeConversationHistoryMessage,
  RuntimeModelConfig,
  RuntimeReferenceFileRecord,
  RuntimeTeamRunRecord,
} from '@goodnight/runtime-protocol';
import { runAgentTeamTurn } from '../../../src/modules/ai/runtime/teams/teamOrchestrator.ts';
import type { AgentTeamRunRecord } from '../../../src/modules/ai/runtime/teams/teamTypes.ts';
import { streamRuntimeProviderTurn } from './nodeRuntimeProviderClient.ts';

const toPreferredTeamAgent = (
  runtimeConfig: RuntimeModelConfig,
): Extract<AgentTeamRunRecord['members'][number]['agentId'], 'claude' | 'codex'> =>
  runtimeConfig.provider === 'anthropic' ? 'claude' : 'codex';

const mapRuntimeTeamRun = (teamRun: AgentTeamRunRecord): RuntimeTeamRunRecord => ({
  id: teamRun.id,
  sessionId: teamRun.threadId,
  turnId: teamRun.turnId,
  providerId: 'team',
  summary: teamRun.summary,
  strategy: teamRun.strategy,
  status: teamRun.status,
  phases: teamRun.phases.map((phase) => ({
    id: phase.id,
    title: phase.title,
    summary: phase.summary,
    goal: phase.goal,
    status: phase.status,
    startedAt: phase.startedAt,
    completedAt: phase.completedAt,
    taskIds: [...phase.taskIds],
  })),
  members: teamRun.members.map((member) => ({
    id: member.id,
    sessionId: member.threadId,
    parentTurnId: member.parentTurnId,
    taskId: member.taskId,
    phaseId: member.phaseId,
    role: member.role,
    agentId: member.agentId,
    title: member.title,
    prompt: member.prompt,
    status: member.status,
    startedAt: member.startedAt,
    completedAt: member.completedAt,
    result: member.result,
    error: member.error,
    dependsOn: [...member.dependsOn],
    changedPaths: [...member.changedPaths],
  })),
  finalSummary: teamRun.finalSummary,
  changedPaths: [...teamRun.changedPaths],
  createdAt: teamRun.createdAt,
  updatedAt: teamRun.updatedAt,
});

const executeTeamMemberPrompt = async (input: {
  runtimeConfig: RuntimeModelConfig;
  prompt: string;
  agent: string;
}): Promise<string> => {
  const finalContent = await streamRuntimeProviderTurn({
    runtimeConfig: input.runtimeConfig,
    systemPrompt: `You are the ${input.agent} role in a multi-agent team run. Complete only the assigned subtask and respond concisely.`,
    prompt: input.prompt,
  });

  return finalContent.trim();
};

export const runNodeRuntimeTeamTurn = async (input: {
  projectId: string;
  projectName: string;
  sessionId: string;
  turnId: string;
  projectRoot: string;
  prompt: string;
  runtimeConfig: RuntimeModelConfig;
  contextWindowTokens: number;
  conversationHistory: RuntimeConversationHistoryMessage[];
  referenceFiles: RuntimeReferenceFileRecord[];
  agentInstructions: string[];
  onUpdate?: (teamRun: RuntimeTeamRunRecord) => void;
}) => {
  const result = await runAgentTeamTurn({
    projectId: input.projectId,
    projectName: input.projectName,
    threadId: input.sessionId,
    turnId: input.turnId,
    userInput: input.prompt,
    projectRoot: input.projectRoot,
    preferredAgent: toPreferredTeamAgent(input.runtimeConfig),
    contextWindowTokens: input.contextWindowTokens,
    conversationHistory: input.conversationHistory,
    agentInstructions: input.agentInstructions,
    referenceFiles: input.referenceFiles.map((file) => ({
      path: file.path,
      summary: file.summary,
      content: file.content || file.summary || file.title,
    })),
    memoryEntries: [],
    onTeamRunUpdate: (teamRun) => {
      input.onUpdate?.(mapRuntimeTeamRun(teamRun));
    },
    runPrompt: async ({ agent, prompt }) => {
      try {
        const content = await executeTeamMemberPrompt({
          runtimeConfig: input.runtimeConfig,
          prompt,
          agent,
        });
        return {
          success: true,
          content,
          error: null,
          exitCode: 0,
          changedPaths: [],
        };
      } catch (error) {
        return {
          success: false,
          content: '',
          error: error instanceof Error ? error.message : String(error),
          exitCode: 1,
          changedPaths: [],
        };
      }
    },
  });

  return {
    finalContent: result.finalContent,
    changedPaths: result.changedPaths,
    teamRun: mapRuntimeTeamRun(result.teamRun),
  };
};
