// 文件作用：适配器，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type {
  CanonicalEvent,
  CanonicalEventFor,
  CanonicalEventPayloadMap,
  CanonicalEventType,
  MessagePhase,
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
  let reasoningStarted = false;

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
        type.startsWith('message.') || type.startsWith('reasoning.')
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

  const ensureMessageStarted = (emit: CanonicalEventEmitter, phase: MessagePhase) => {
    if (activeMessageId) {
      return activeMessageId;
    }

    activeMessageId = `msg_${input.runId}`;
    emit(
      buildEvent(
        'message.started',
        { role: 'assistant', phase },
        {
          messageId: activeMessageId,
          source: { kind: 'model', provider: providerId, name: 'assistant' },
        },
      ),
    );
    return activeMessageId;
  };

  const ensureReasoningStarted = (emit: CanonicalEventEmitter) => {
    if (reasoningStarted) {
      return;
    }

    reasoningStarted = true;
    emit(
      buildEvent(
        'reasoning.started',
        {},
        {
          messageId: activeMessageId,
          source: { kind: 'model', provider: providerId, name: 'assistant' },
        },
      ),
    );
  };

  const completeReasoning = (emit: CanonicalEventEmitter) => {
    if (!reasoningStarted) {
      return;
    }

    emit(
      buildEvent(
        'reasoning.completed',
        {},
        {
          messageId: activeMessageId,
          source: { kind: 'model', provider: providerId, name: 'assistant' },
        },
      ),
    );
    reasoningStarted = false;
  };

  const emitMessageDelta = (
    delta: string,
    phase: MessagePhase,
    emit: CanonicalEventEmitter,
  ) => {
    completeReasoning(emit);
    ensureMessageStarted(emit, phase);
    emit(
      buildEvent(
        'message.delta',
        { textChunk: delta, phase },
        {
          messageId: activeMessageId,
          source: { kind: 'model', provider: providerId, name: 'assistant' },
        },
      ),
    );
  };

  return {
    onProviderEvent(event: RuntimeProviderEvent, emit: CanonicalEventEmitter) {
      ensureRunStarted(emit);

      if (event.kind === 'thinking') {
        ensureReasoningStarted(emit);
        emit(
          buildEvent(
            'reasoning.delta',
            { textChunk: event.delta },
            {
              messageId: activeMessageId,
              source: { kind: 'model', provider: providerId, name: 'assistant' },
            },
          ),
        );
        return;
      }

      if (event.kind === 'text') {
        emitMessageDelta(event.delta, event.phase || 'final_answer', emit);
        return;
      }

      if (event.kind === 'commentary_text') {
        emitMessageDelta(event.delta, 'commentary', emit);
        return;
      }

      if (event.kind === 'final_text') {
        emitMessageDelta(event.delta, 'final_answer', emit);
        return;
      }

      if (event.kind === 'tool_call') {
        completeReasoning(emit);
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
        completeReasoning(emit);
        ensureMessageStarted(emit, 'final_answer');
        emit(
          buildEvent(
            'message.completed',
            { finalText: event.finalText, phase: 'final_answer' },
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
