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

export const sanitizeAgentVisibleText = (value: string) =>
  value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export type StreamTextEvent = { kind: 'text'; delta: string };
export type StreamToolCallEvent = {
  kind: 'tool_call';
  id: string;
  name: string;
  input: Record<string, unknown>;
};
export type StreamSplitEvent = StreamTextEvent | StreamToolCallEvent;

const TOOL_USE_OPEN_TAG = '<tool_use>';
const TOOL_USE_CLOSE_TAG = '</tool_use>';

const getPartialToolUsePrefixLength = (value: string) => {
  const maxLength = Math.min(value.length, TOOL_USE_OPEN_TAG.length - 1);
  for (let length = maxLength; length > 0; length -= 1) {
    if (value.endsWith(TOOL_USE_OPEN_TAG.slice(0, length))) {
      return length;
    }
  }
  return 0;
};

const createStreamToolCallId = () =>
  `call_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

const normalizeStreamToolName = (name: string) => {
  const trimmed = name.trim();
  return trimmed.toLowerCase() === 'read' ? 'view' : trimmed;
};

const parseToolCallFromProtocolBuffer = (protocolContent: string): StreamToolCallEvent[] => {
  const events: StreamToolCallEvent[] = [];
  const toolRegex = /<tool\s+name="([^"]+)">\s*(?:<tool_params>([\s\S]*?)<\/tool_params>)?\s*<\/tool>/g;
  let match: RegExpExecArray | null;

  while ((match = toolRegex.exec(protocolContent)) !== null) {
    const name = match[1]?.trim();
    const paramsText = match[2];
    if (!name || !paramsText) {
      continue;
    }

    try {
      const input = JSON.parse(paramsText);
      if (input && typeof input === 'object' && !Array.isArray(input)) {
        events.push({
          kind: 'tool_call',
          id: createStreamToolCallId(),
          name: normalizeStreamToolName(name),
          input: input as Record<string, unknown>,
        });
      }
    } catch {
      // Malformed tool params are ignored; the full response path can still request repair.
    }
  }

  return events;
};

export const createStreamingTextSplitter = () => {
  let buffer = '';
  let mode: 'idle' | 'protocol' = 'idle';

  const feed = (delta: string): StreamSplitEvent[] => {
    const events: StreamSplitEvent[] = [];
    buffer += delta;

    while (buffer) {
      if (mode === 'idle') {
        const openIndex = buffer.indexOf(TOOL_USE_OPEN_TAG);
        if (openIndex >= 0) {
          const text = buffer.slice(0, openIndex);
          if (text) {
            events.push({ kind: 'text', delta: text });
          }
          buffer = buffer.slice(openIndex + TOOL_USE_OPEN_TAG.length);
          mode = 'protocol';
          continue;
        }

        const heldLength = getPartialToolUsePrefixLength(buffer);
        const text = buffer.slice(0, buffer.length - heldLength);
        if (text) {
          events.push({ kind: 'text', delta: text });
        }
        buffer = buffer.slice(buffer.length - heldLength);
        break;
      }

      const closeIndex = buffer.indexOf(TOOL_USE_CLOSE_TAG);
      if (closeIndex < 0) {
        break;
      }

      const protocolContent = buffer.slice(0, closeIndex);
      events.push(...parseToolCallFromProtocolBuffer(protocolContent));
      buffer = buffer.slice(closeIndex + TOOL_USE_CLOSE_TAG.length);
      mode = 'idle';
    }

    return events;
  };

  return {
    feed,
    flush: (): StreamSplitEvent[] => {
      if (mode === 'protocol') {
        buffer = '';
        mode = 'idle';
        return [];
      }

      if (!buffer) {
        return [];
      }

      const events: StreamSplitEvent[] = [{ kind: 'text', delta: buffer }];
      buffer = '';
      return events;
    },
    reset: () => {
      buffer = '';
      mode = 'idle';
    },
  };
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
