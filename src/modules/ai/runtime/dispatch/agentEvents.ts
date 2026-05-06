import type { CompactionReason } from '../compaction/compactionTypes.ts';
import type { RuntimeToolStep } from '../agent-kernel/agentKernelTypes.ts';
import type { AgentTeamRunRecord } from '../teams/teamTypes.ts';

export type AgentToolCallSnapshot = {
  id: string;
  parentToolCallId?: string | null;
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed' | 'blocked';
  resultPreview: string;
  resultContent?: string;
  fileChanges?: Array<{
    path: string;
    operation?: 'write' | 'edit' | 'delete';
    beforeContent: string | null;
    afterContent: string | null;
    verified?: boolean;
  }>;
};

export type AgentEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'tool_call_started'; toolCall: AgentToolCallSnapshot }
  | { type: 'tool_call_completed'; toolCall: AgentToolCallSnapshot }
  | {
      type: 'tool_result';
      toolCallId: string;
      name: string;
      status: AgentToolCallSnapshot['status'];
      content: string;
      isError?: boolean;
      fileChanges?: AgentToolCallSnapshot['fileChanges'];
    }
  | { type: 'context_compacted'; reason: CompactionReason }
  | { type: 'final_text'; text: string }
  | { type: 'error'; message: string };

export type AgentEventState = {
  visibleText: string;
  reasoningText: string;
  toolCalls: AgentToolCallSnapshot[];
  toolResultsByCallId: Record<
    string,
    Extract<AgentEvent, { type: 'tool_result' }>
  >;
  compactedReasons: CompactionReason[];
  errors: string[];
};

export type AgentStoredRuntimeFileChange = {
  path: string;
  operation?: 'write' | 'edit' | 'delete';
  beforeContent: string | null;
  afterContent: string | null;
  verified?: boolean;
};

export type AgentStoredRuntimeEvent<ApprovalDisplay = unknown, QuestionPayload = unknown> =
  | {
      id: string;
      kind: 'tool_use';
      toolCallId: string;
      parentToolCallId?: string | null;
      toolName: string;
      input: Record<string, unknown>;
      status: RuntimeToolStep['status'];
      createdAt: number;
    }
  | {
      id: string;
      kind: 'tool_result';
      toolCallId: string;
      parentToolCallId?: string | null;
      toolName: string;
      status: RuntimeToolStep['status'];
      output: string;
      fileChanges?: AgentStoredRuntimeFileChange[];
      createdAt: number;
    }
  | {
      id: string;
      kind: 'approval';
      approvalId: string;
      toolCallId?: string | null;
      actionType: string;
      summary: string;
      riskLevel: 'low' | 'medium' | 'high';
      status: 'pending' | 'approved' | 'denied';
      display?: ApprovalDisplay;
      createdAt: number;
    }
  | {
      id: string;
      kind: 'question';
      questionId: string;
      payload: QuestionPayload;
      createdAt: number;
    };

const RAW_DSML_BLOCK_PATTERN = /<\s*\|\s*DSML\b[\s\S]*?(?=(?:\n\s*\n)|$)/gi;
const RAW_TOOL_USE_BLOCK_PATTERN = /<tool_use\b[^>]*>[\s\S]*?<\/tool_use>/gi;
const RAW_BARE_TOOL_BLOCK_PATTERN = /^\s*<tool name="[^"]+">[\s\S]*?^\s*<\/tool>\s*$/gim;
const RAW_TOOL_RESULT_BLOCK_PATTERN =
  /<tool_result\b[^>]*>[\s\S]*?<\/tool_result>/gi;
const RAW_LEGACY_BASH_BLOCK_PATTERN = /<bash\b[^>]*>[\s\S]*?<\/bash>/gi;
const RAW_TRANSCRIPT_TOOL_RESULT_PATTERN =
  /^[^\S\r\n]*Tool\s+\S+\s+result:[^\S\r\n]*(?:\r?\n[\s\S]*?(?=(?:\r?\n[^\S\r\n]*\r?\n)|$))?/gim;
const RAW_TRANSCRIPT_ROLE_LINE_PATTERN = /^\s*(?:user|assistant|system):\s*$/gim;
const RAW_XML_DECLARATION_LINE_PATTERN = /^\s*<\?xml\b[^>]*\?>\s*$/gim;
const RAW_PROTOCOL_LINE_PATTERN =
  /^\s*(?:DSML|tool_calls>|invoke name=|parameter name=|string="true"|string="false"|<tool name=[^>]*>|<\/tool>|<tool_params>|<\/tool_params>|<tool_use>|<\/tool_use>|<tool_result\b[^>]*>|<\/tool_result>|<bash>|<\/bash>|<cmd>|<\/cmd>)\s*$/gim;
const RAW_FRAGMENTED_TOOL_PROTOCOL_LINE_PATTERN =
  /^\s*(?:<\/?\s*tool_?|_?use\s*>|<\/?\s*tool\s*|_tool_use\s*>|tool_use\s*>|<\/?\s*tool_result_?|_result\s*>)\s*$/gim;
const PROTOCOL_FRAGMENT_LINE_START_PATTERN =
  /^\s*(?:<tool_use>|<tool name=[^>]*>|<tool_params>|<\/tool>|<\/tool_params>|<\/tool_use>|<tool_result\b[^>]*>|<\/tool_result>|<bash>|<\/bash>|<cmd>|<\/cmd>)/i;
const PROTOCOL_FRAGMENT_TOKEN_PATTERN =
  /<tool_use>|<tool name=[^>]*>|<tool_params>|<\/tool>|<\/tool_params>|<\/tool_use>|<tool_result\b[^>]*>|<\/tool_result>|<bash>|<\/bash>|<cmd>|<\/cmd>/gi;

const isProtocolFragmentLine = (line: string) => {
  if (!PROTOCOL_FRAGMENT_LINE_START_PATTERN.test(line)) return false;
  const withoutMarkers = line.replace(PROTOCOL_FRAGMENT_TOKEN_PATTERN, ' ').trim();
  if (!withoutMarkers) return true;
  const withoutQuotedStrings = withoutMarkers.replace(/"[^"\n]*"/g, '').trim();
  return /^[\[\]\{\}:,\s]*$/.test(withoutQuotedStrings);
};

export const sanitizeAgentVisibleText = (value: string) => {
  const cleaned = value
    .replace(RAW_DSML_BLOCK_PATTERN, '')
    .replace(RAW_TOOL_USE_BLOCK_PATTERN, '')
    .replace(RAW_BARE_TOOL_BLOCK_PATTERN, '')
    .replace(RAW_TOOL_RESULT_BLOCK_PATTERN, '')
    .replace(RAW_LEGACY_BASH_BLOCK_PATTERN, '')
    .replace(RAW_TRANSCRIPT_ROLE_LINE_PATTERN, '')
    .replace(RAW_TRANSCRIPT_TOOL_RESULT_PATTERN, '')
    .replace(RAW_XML_DECLARATION_LINE_PATTERN, '')
    .replace(RAW_PROTOCOL_LINE_PATTERN, '')
    .replace(RAW_FRAGMENTED_TOOL_PROTOCOL_LINE_PATTERN, '')
    .split(/\r?\n/)
    .filter((line) => !isProtocolFragmentLine(line))
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
};

const appendVisibleText = (current: string, next: string) => {
  const cleaned = sanitizeAgentVisibleText(next);
  if (!cleaned) return current;
  return current ? `${current}\n\n${cleaned}` : cleaned;
};

const appendReasoningText = (current: string, next: string) => {
  const cleaned = sanitizeAgentVisibleText(next);
  if (!cleaned) return current;
  return `${current}${current && !current.endsWith(' ') ? ' ' : ''}${cleaned}`.trim();
};

const upsertToolCall = (
  toolCalls: AgentToolCallSnapshot[],
  nextToolCall: AgentToolCallSnapshot
) => {
  const index = toolCalls.findIndex((toolCall) => toolCall.id === nextToolCall.id);
  if (index < 0) {
    return [...toolCalls, nextToolCall];
  }

  const next = [...toolCalls];
  next[index] = { ...next[index], ...nextToolCall };
  return next;
};

export const createAgentEventState = (): AgentEventState => ({
  visibleText: '',
  reasoningText: '',
  toolCalls: [],
  toolResultsByCallId: {},
  compactedReasons: [],
  errors: [],
});

export const reduceAgentEvent = (
  state: AgentEventState,
  event: AgentEvent
): AgentEventState => {
  switch (event.type) {
    case 'text_delta':
      return { ...state, visibleText: appendVisibleText(state.visibleText, event.text) };
    case 'reasoning_delta':
      return { ...state, reasoningText: appendReasoningText(state.reasoningText, event.text) };
    case 'tool_call_started':
    case 'tool_call_completed':
      return { ...state, toolCalls: upsertToolCall(state.toolCalls, event.toolCall) };
    case 'tool_result': {
      const existing = state.toolCalls.find((toolCall) => toolCall.id === event.toolCallId);
      const resultPreview = event.content.slice(0, 1000);
      const toolCall = existing
        ? {
            ...existing,
            status: event.status,
            resultPreview,
            resultContent: event.content,
            fileChanges: event.fileChanges,
          }
        : {
            id: event.toolCallId,
            name: event.name,
            input: {},
            status: event.status,
            resultPreview,
            resultContent: event.content,
            fileChanges: event.fileChanges,
          };
      return {
        ...state,
        toolCalls: upsertToolCall(state.toolCalls, toolCall),
        toolResultsByCallId: {
          ...state.toolResultsByCallId,
          [event.toolCallId]: event,
        },
      };
    }
    case 'context_compacted':
      return { ...state, compactedReasons: [...state.compactedReasons, event.reason] };
    case 'final_text':
      return { ...state, visibleText: appendVisibleText(state.visibleText, event.text) };
    case 'error':
      return { ...state, errors: [...state.errors, event.message] };
    default:
      return state;
  }
};

export const createAgentEventDispatcher = (onEvent?: (event: AgentEvent) => void) => ({
  emit: (event: AgentEvent) => {
    onEvent?.(event);
  },
});

export const buildRuntimeEventId = (kind: AgentStoredRuntimeEvent['kind'], sourceId: string) =>
  `runtime-event_${kind}_${sourceId}`;

export const buildSyntheticRuntimeToolCallId = (scope: string, sourceId: string, step?: string) =>
  [scope, sourceId, step].filter(Boolean).join(':');

export const toRuntimeEventStatus = (status: 'running' | 'completed' | 'failed' | 'blocked' | 'pending') =>
  status === 'completed' || status === 'failed' || status === 'blocked' ? status : 'running';

export const upsertRuntimeEvent = <TRuntimeEvent extends AgentStoredRuntimeEvent = AgentStoredRuntimeEvent>(
  runtimeEvents: TRuntimeEvent[] | undefined,
  nextEvent: TRuntimeEvent,
  matcher: (event: TRuntimeEvent) => boolean
): TRuntimeEvent[] => {
  const events = [...(runtimeEvents || [])];
  const index = events.findIndex(matcher);

  if (index >= 0) {
    events[index] = nextEvent;
    return events;
  }

  events.push(nextEvent);
  return events;
};

export const mapRuntimeEvents = <TRuntimeEvent extends AgentStoredRuntimeEvent = AgentStoredRuntimeEvent>(
  runtimeEvents: TRuntimeEvent[] | undefined,
  matcher: (event: TRuntimeEvent) => boolean,
  updater: (event: TRuntimeEvent) => TRuntimeEvent
) => (runtimeEvents || []).map((event) => (matcher(event) ? updater(event) : event));

export const upsertRuntimeToolUseEvent = <TRuntimeEvent extends AgentStoredRuntimeEvent = AgentStoredRuntimeEvent>(
  runtimeEvents: TRuntimeEvent[] | undefined,
  input: {
    toolCallId: string;
    parentToolCallId?: string | null;
    toolName: string;
    toolInput: Record<string, unknown>;
    status: RuntimeToolStep['status'];
  }
): TRuntimeEvent[] => {
  const existingEvent = runtimeEvents?.find(
    (event): event is Extract<TRuntimeEvent, { kind: 'tool_use' }> =>
      event.kind === 'tool_use' && event.toolCallId === input.toolCallId
  );

  return upsertRuntimeEvent(
    runtimeEvents,
    {
      id: buildRuntimeEventId('tool_use', input.toolCallId),
      kind: 'tool_use',
      toolCallId: input.toolCallId,
      parentToolCallId: input.parentToolCallId ?? null,
      toolName: input.toolName,
      input: input.toolInput,
      status: input.status,
      createdAt: existingEvent?.createdAt || Date.now(),
    } as Extract<TRuntimeEvent, { kind: 'tool_use' }>,
    (event) => event.kind === 'tool_use' && event.toolCallId === input.toolCallId
  );
};

export const upsertRuntimeToolResultEvent = <TRuntimeEvent extends AgentStoredRuntimeEvent = AgentStoredRuntimeEvent>(
  runtimeEvents: TRuntimeEvent[] | undefined,
  input: {
    toolCallId: string;
    parentToolCallId?: string | null;
    toolName: string;
    status: RuntimeToolStep['status'];
    output: string;
    fileChanges?: AgentStoredRuntimeFileChange[];
  }
): TRuntimeEvent[] => {
  const existingEvent = runtimeEvents?.find(
    (event): event is Extract<TRuntimeEvent, { kind: 'tool_result' }> =>
      event.kind === 'tool_result' && event.toolCallId === input.toolCallId
  );

  return upsertRuntimeEvent(
    runtimeEvents,
    {
      id: buildRuntimeEventId('tool_result', input.toolCallId),
      kind: 'tool_result',
      toolCallId: input.toolCallId,
      parentToolCallId: input.parentToolCallId ?? null,
      toolName: input.toolName,
      status: input.status,
      output: input.output,
      fileChanges: input.fileChanges,
      createdAt: existingEvent?.createdAt || Date.now(),
    } as Extract<TRuntimeEvent, { kind: 'tool_result' }>,
    (event) => event.kind === 'tool_result' && event.toolCallId === input.toolCallId
  );
};

export const upsertRuntimeApprovalEvent = <TRuntimeEvent extends AgentStoredRuntimeEvent = AgentStoredRuntimeEvent>(
  runtimeEvents: TRuntimeEvent[] | undefined,
  input: Extract<TRuntimeEvent, { kind: 'approval' }>
) => {
  const existingEvent = runtimeEvents?.find(
    (event): event is Extract<TRuntimeEvent, { kind: 'approval' }> =>
      event.kind === 'approval' && event.approvalId === input.approvalId
  );

  return upsertRuntimeEvent(
    runtimeEvents,
    {
      ...input,
      createdAt: existingEvent?.createdAt || input.createdAt || Date.now(),
    },
    (event) => event.kind === 'approval' && event.approvalId === input.approvalId
  );
};

export const upsertRuntimeQuestionEvent = <TRuntimeEvent extends AgentStoredRuntimeEvent = AgentStoredRuntimeEvent>(
  runtimeEvents: TRuntimeEvent[] | undefined,
  input: Extract<TRuntimeEvent, { kind: 'question' }>
) => {
  const existingEvent = runtimeEvents?.find(
    (event): event is Extract<TRuntimeEvent, { kind: 'question' }> =>
      event.kind === 'question' && event.questionId === input.questionId
  );

  return upsertRuntimeEvent(
    runtimeEvents,
    {
      ...input,
      createdAt: existingEvent?.createdAt || input.createdAt || Date.now(),
    },
    (event) => event.kind === 'question' && event.questionId === input.questionId
  );
};

export const syncRuntimeEventsWithToolCalls = <TRuntimeEvent extends AgentStoredRuntimeEvent = AgentStoredRuntimeEvent>(
  runtimeEvents: TRuntimeEvent[] | undefined,
  toolCalls: RuntimeToolStep[]
): TRuntimeEvent[] => {
  let nextEvents = [...(runtimeEvents || [])];

  for (const toolCall of toolCalls) {
    nextEvents = upsertRuntimeToolUseEvent(nextEvents, {
      toolCallId: toolCall.id,
      parentToolCallId: toolCall.parentToolCallId ?? null,
      toolName: toolCall.name,
      toolInput: toolCall.input,
      status: toolCall.status,
    });

    if (toolCall.status === 'running') {
      continue;
    }

    const resultEvent = upsertRuntimeToolResultEvent<TRuntimeEvent>([], {
      toolCallId: toolCall.id,
      parentToolCallId: toolCall.parentToolCallId ?? null,
      toolName: toolCall.name,
      status: toolCall.status,
      output: toolCall.resultContent || toolCall.resultPreview,
      fileChanges: toolCall.fileChanges,
    })[0]!;
    const existingToolResultIndex = nextEvents.findIndex(
      (event) => event.kind === 'tool_result' && event.toolCallId === toolCall.id
    );

    if (existingToolResultIndex >= 0) {
      nextEvents[existingToolResultIndex] = {
        ...resultEvent,
        createdAt: nextEvents[existingToolResultIndex]!.createdAt,
      };
    } else {
      const insertionIndex = nextEvents.findIndex(
        (event) => event.kind === 'tool_use' && event.toolCallId === toolCall.id
      );
      if (insertionIndex >= 0) {
        nextEvents.splice(insertionIndex + 1, 0, resultEvent);
      } else {
        nextEvents.push(resultEvent);
      }
    }
  }

  return nextEvents;
};

export const syncTeamRunRuntimeEvents = <TRuntimeEvent extends AgentStoredRuntimeEvent = AgentStoredRuntimeEvent>(
  runtimeEvents: TRuntimeEvent[] | undefined,
  parentToolCallId: string,
  teamRun: Pick<AgentTeamRunRecord, 'id' | 'phases' | 'members'>
): TRuntimeEvent[] => {
  let nextEvents = [...(runtimeEvents || [])];

  for (const phase of teamRun.phases) {
    if (phase.status === 'pending' && !phase.startedAt && !phase.completedAt) {
      continue;
    }

    const phaseToolCallId = buildSyntheticRuntimeToolCallId('team-phase', teamRun.id, phase.id);
    nextEvents = upsertRuntimeToolUseEvent(nextEvents, {
      toolCallId: phaseToolCallId,
      parentToolCallId,
      toolName: 'team_phase',
      toolInput: {
        id: phase.id,
        title: phase.title,
        summary: phase.summary,
        goal: phase.goal,
      },
      status: toRuntimeEventStatus(phase.status),
    });

    if (phase.status === 'completed' || phase.status === 'failed') {
      nextEvents = upsertRuntimeToolResultEvent(nextEvents, {
        toolCallId: phaseToolCallId,
        parentToolCallId,
        toolName: 'team_phase',
        status: toRuntimeEventStatus(phase.status),
        output: phase.summary || phase.goal || phase.title,
      });
    }

    for (const member of teamRun.members.filter((entry) => entry.phaseId === phase.id)) {
      if (member.status === 'pending' && !member.startedAt && !member.completedAt) {
        continue;
      }

      const memberToolCallId = buildSyntheticRuntimeToolCallId('team-member', teamRun.id, member.id);
      nextEvents = upsertRuntimeToolUseEvent(nextEvents, {
        toolCallId: memberToolCallId,
        parentToolCallId: phaseToolCallId,
        toolName: 'team_member_task',
        toolInput: {
          title: member.title,
          agent: member.agentId,
          role: member.role,
        },
        status: toRuntimeEventStatus(member.status),
      });

      if (member.status === 'completed' || member.status === 'failed') {
        nextEvents = upsertRuntimeToolResultEvent(nextEvents, {
          toolCallId: memberToolCallId,
          parentToolCallId: phaseToolCallId,
          toolName: 'team_member_task',
          status: toRuntimeEventStatus(member.status),
          output: member.error || member.result || `${member.agentId} finished ${member.title}.`,
        });
      }
    }
  }

  return nextEvents;
};
