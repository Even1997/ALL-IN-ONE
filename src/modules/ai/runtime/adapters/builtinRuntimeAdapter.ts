import type {
  CanonicalEvent,
  CanonicalEventFor,
  CanonicalEventType,
  CanonicalEventPayloadMap,
} from '@goodnight/runtime-protocol';
import type { RuntimeProviderEvent } from '../provider/runtimeProviderEvents.ts';

type BuiltinRuntimeAdapterInput = {
  sessionId: string;
  runId: string;
  turnId: string;
  providerId?: string;
};

type CanonicalEventEmitter = (event: CanonicalEvent) => void;

export const createBuiltinRuntimeAdapter = (input: BuiltinRuntimeAdapterInput) => {
  let transientSeq = 0;
  let started = false;
  let activeMessageId: string | null = null;

  const providerId = input.providerId || 'built-in';

  const buildEvent = <TType extends CanonicalEventType>(
    type: TType,
    payload: CanonicalEventPayloadMap[TType],
    overrides: Partial<CanonicalEventFor<TType>> = {},
  ): CanonicalEventFor<TType> => ({
    eventId: `evt_${input.runId}_${++transientSeq}`,
    runId: input.runId,
    turnId: input.turnId,
    sessionId: input.sessionId,
    messageId: activeMessageId,
    type,
    ts: Date.now(),
    seq: transientSeq,
    source: {
      kind:
        type.startsWith('message.')
          ? 'model'
          : type.startsWith('tool.')
            ? 'tool'
            : 'runtime',
      provider: providerId,
      name: 'built-in-runtime',
    },
    payload,
    providerMeta: {
      transientSeq,
    },
    ...overrides,
  } as unknown as CanonicalEventFor<TType>);

  const ensureRunStarted = (emit: CanonicalEventEmitter) => {
    if (started) {
      return;
    }

    started = true;
    emit(
      buildEvent('run.started', {
        providerId,
        mode: 'agent',
      }),
    );
  };

  const ensureMessageStarted = (emit: CanonicalEventEmitter) => {
    if (activeMessageId) {
      return activeMessageId;
    }

    activeMessageId = `msg_${input.runId}`;
    emit(
      buildEvent(
        'message.started',
        { role: 'assistant' },
        {
          messageId: activeMessageId,
          source: { kind: 'model', provider: providerId, name: 'assistant' },
        },
      ),
    );
    return activeMessageId;
  };

  return {
    onProviderEvent(event: RuntimeProviderEvent, emit: CanonicalEventEmitter) {
      ensureRunStarted(emit);

      if (event.kind === 'thinking') {
        emit(
          buildEvent('progress.updated', {
            label: '正在分析',
            scope: 'phase',
            importance: 'low',
          }),
        );
        return;
      }

      if (event.kind === 'text') {
        ensureMessageStarted(emit);
        emit(
          buildEvent(
            'message.delta',
            { textChunk: event.delta },
            {
              messageId: activeMessageId,
              source: { kind: 'model', provider: providerId, name: 'assistant' },
            },
          ),
        );
        return;
      }

      if (event.kind === 'tool_call') {
        emit(
          buildEvent(
            'tool.started',
            {
              toolCallId: event.toolCall.id,
              toolName: event.toolCall.name,
              input: event.toolCall.input,
              inputSummary: JSON.stringify(event.toolCall.input),
            },
            {
              correlationId: event.toolCall.id,
              source: { kind: 'tool', provider: providerId, name: event.toolCall.name },
            },
          ),
        );
        return;
      }

      if (event.kind === 'usage') {
        emit(
          buildEvent('warning.raised', {
            code: 'usage.update',
            summary: `Output tokens: ${event.outputTokens}`,
          }),
        );
        return;
      }

      if (event.kind === 'done') {
        ensureMessageStarted(emit);
        emit(
          buildEvent(
            'message.completed',
            { finalText: event.finalText },
            {
              messageId: activeMessageId,
              source: { kind: 'model', provider: providerId, name: 'assistant' },
            },
          ),
        );
        emit(
          buildEvent('run.completed', {
            outcome: 'success',
          }),
        );
      }
    },
  };
};
