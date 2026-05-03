import type { AgentContextConversationMessage } from '../context/agentContextTypes.ts';
import type { AgentTeamPhaseId, AgentTeamPhasePlan, AgentTeamPlan, AgentTeamRole, AgentTeamTask } from './teamTypes.ts';

const createTaskId = (phaseId: AgentTeamPhaseId, index: number) => `${phaseId}_task_${index + 1}`;

const summarizePrompt = (value: string, maxLength = 80) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'Untitled task';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
};

const buildRecentHistoryBlock = (conversationHistory: AgentContextConversationMessage[]) => {
  const recentHistory = conversationHistory
    .slice(-5)
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n');

  return recentHistory ? `Recent conversation:\n${recentHistory}` : null;
};

const toSearchableText = (value: string) => value.toLowerCase();

const hasAnyKeyword = (value: string, keywords: string[]) =>
  keywords.some((keyword) => value.includes(keyword));

const buildImplementationTaskSpecs = (userInput: string) => {
  const normalizedInput = toSearchableText(userInput);
  const looksUiHeavy = hasAnyKeyword(normalizedInput, [
    'ui',
    'ux',
    'design',
    '\u9875\u9762',
    '\u754c\u9762',
    '\u4ea4\u4e92',
    '\u524d\u7aef',
    '\u6837\u5f0f',
    '\u7ec4\u4ef6',
  ]);
  const looksDataHeavy = hasAnyKeyword(normalizedInput, [
    'api',
    'backend',
    'server',
    'database',
    'db',
    'schema',
    'model',
    'service',
    '\u63a5\u53e3',
    '\u540e\u7aef',
    '\u6570\u636e',
  ]);
  const looksWorkflowHeavy = hasAnyKeyword(normalizedInput, [
    'agent',
    'team',
    'workflow',
    'orchestr',
    'runtime',
    'state',
    'thread',
    'session',
    'memory',
    '\u591aagent',
    '\u591a agent',
    '\u7f16\u6392',
    '\u72b6\u6001',
  ]);
  const looksVerificationHeavy = hasAnyKeyword(normalizedInput, [
    'test',
    'verify',
    'qa',
    'review',
    'bug',
    '\u6d4b\u8bd5',
    '\u9a8c\u8bc1',
    '\u68c0\u67e5',
  ]);

  const taskSpecs: Array<{
    role: AgentTeamRole;
    title: string;
    dependsOn?: string[];
  }> = [
    {
      role: 'implementer',
      title: looksWorkflowHeavy
        ? 'Implement orchestration, state, and runtime integration'
        : 'Implement core architecture and shared integration points',
    },
  ];

  if (looksDataHeavy || !looksUiHeavy) {
    taskSpecs.push({
      role: 'implementer',
      title: 'Implement backend, data, and service-layer changes',
      dependsOn: [createTaskId('implementation', 0)],
    });
  }

  taskSpecs.push({
    role: 'implementer',
    title: looksUiHeavy
      ? 'Implement UI surfaces, interaction states, and user feedback'
      : 'Implement user-facing wiring and final interaction polish',
    dependsOn: [createTaskId('implementation', 0)],
  });

  if (looksVerificationHeavy || looksWorkflowHeavy || looksDataHeavy) {
    taskSpecs.push({
      role: 'implementer',
      title: 'Implement verification hooks, edge-case handling, and completion checks',
      dependsOn: taskSpecs.map((_, index) => createTaskId('implementation', index)),
    });
  }

  return taskSpecs;
};

const buildPhasePrompt = (input: {
  phaseId: AgentTeamPhaseId;
  role: AgentTeamRole;
  projectName: string;
  userInput: string;
  phaseGoal: string;
  priorPhaseOutputs?: string[];
  conversationHistory: AgentContextConversationMessage[];
}) => {
  const roleInstructionMap: Record<AgentTeamRole, string> = {
    coordinator: 'Coordinate the team and synthesize outputs into a coherent next step.',
    product_architect:
      'Think like a product architect. Clarify scope, architecture, module boundaries, data flow, and major risks before implementation.',
    ui_interaction_designer:
      'Think like a UI and interaction designer. Define user flows, states, feedback, empty/loading/error/success behavior, and interaction details.',
    implementer:
      'Think like a senior implementation engineer. Turn the approved design into concrete implementation work with minimal ambiguity.',
    qa_reviewer:
      'Think like a QA and review lead. Validate coverage, regressions, UX edge cases, and missing verification.',
  };

  return [
    `Project: ${input.projectName}`,
    `Assigned phase: ${input.phaseId}`,
    `Assigned role: ${input.role}`,
    roleInstructionMap[input.role],
    `Original request: ${input.userInput}`,
    `Phase goal: ${input.phaseGoal}`,
    input.priorPhaseOutputs && input.priorPhaseOutputs.length > 0
      ? `Approved outputs from previous phases:\n${input.priorPhaseOutputs.map((item) => `- ${item}`).join('\n')}`
      : null,
    buildRecentHistoryBlock(input.conversationHistory),
    'Return a concrete, implementation-oriented result that the next phase can consume directly.',
  ]
    .filter((item): item is string => Boolean(item))
    .join('\n\n');
};

const createPhase = (input: {
  id: AgentTeamPhaseId;
  title: string;
  summary: string;
  goal: string;
  taskSpecs: Array<{
    role: AgentTeamRole;
    title: string;
    dependsOn?: string[];
  }>;
  projectName: string;
  userInput: string;
  priorPhaseOutputs?: string[];
  conversationHistory: AgentContextConversationMessage[];
}): AgentTeamPhasePlan => {
  const tasks: AgentTeamTask[] = input.taskSpecs.map((task, index) => ({
    id: createTaskId(input.id, index),
    phaseId: input.id,
    title: task.title,
    prompt: buildPhasePrompt({
      phaseId: input.id,
      role: task.role,
      projectName: input.projectName,
      userInput: input.userInput,
      phaseGoal: input.goal,
      priorPhaseOutputs: input.priorPhaseOutputs,
      conversationHistory: input.conversationHistory,
    }),
    role: task.role,
    dependsOn: task.dependsOn || [],
  }));

  return {
    id: input.id,
    title: input.title,
    summary: input.summary,
    goal: input.goal,
    tasks,
  };
};

export const buildAgentTeamPlan = (input: {
  projectName: string;
  userInput: string;
  conversationHistory: AgentContextConversationMessage[];
}): AgentTeamPlan => {
  const requestSummary = summarizePrompt(input.userInput, 64);

  const productPhase = createPhase({
    id: 'product_architecture',
    title: 'Product & Architecture',
    summary: `Define the overall solution for ${requestSummary}.`,
    goal:
      'Clarify scope, architecture, data flow, module boundaries, and the execution plan that implementation should follow.',
    taskSpecs: [
      {
        role: 'product_architect',
        title: 'Define product and architecture direction',
      },
    ],
    projectName: input.projectName,
    userInput: input.userInput,
    conversationHistory: input.conversationHistory,
  });

  const uiPhase = createPhase({
    id: 'ui_interaction',
    title: 'UI & Interaction',
    summary: 'Design the user-facing interaction model and interface behavior.',
    goal:
      'Translate the approved solution into user flows, page states, feedback loops, and detailed UI interaction behavior.',
    taskSpecs: [
      {
        role: 'ui_interaction_designer',
        title: 'Design UI flow and interaction states',
      },
    ],
    projectName: input.projectName,
    userInput: input.userInput,
    priorPhaseOutputs: [productPhase.summary],
    conversationHistory: input.conversationHistory,
  });

  const implementationPhase = createPhase({
    id: 'implementation',
    title: 'Implementation',
    summary: 'Implement the approved design in code.',
    goal:
      'Use the architecture and UI interaction outputs to implement the necessary changes across the codebase with clear ownership.',
    taskSpecs: buildImplementationTaskSpecs(input.userInput),
    projectName: input.projectName,
    userInput: input.userInput,
    priorPhaseOutputs: [productPhase.summary, uiPhase.summary],
    conversationHistory: input.conversationHistory,
  });

  const qaPhase = createPhase({
    id: 'qa_review',
    title: 'QA & Review',
    summary: 'Review the end-to-end result, risks, and missing coverage.',
    goal:
      'Validate implementation quality, UX correctness, edge cases, and test or verification gaps before final delivery.',
    taskSpecs: [
      {
        role: 'qa_reviewer',
        title: 'Review implementation and UX quality',
      },
    ],
    projectName: input.projectName,
    userInput: input.userInput,
    priorPhaseOutputs: [productPhase.summary, uiPhase.summary, implementationPhase.summary],
    conversationHistory: input.conversationHistory,
  });

  qaPhase.tasks[0]!.dependsOn = implementationPhase.tasks.map((task) => task.id);

  return {
    summary: `Run a staged multi-agent delivery flow for ${requestSummary}.`,
    strategy:
      'Move through four phases: product/architecture, UI/interaction design, implementation, and QA/review. Each later phase consumes the approved outputs from the earlier phases.',
    phases: [productPhase, uiPhase, implementationPhase, qaPhase],
  };
};
