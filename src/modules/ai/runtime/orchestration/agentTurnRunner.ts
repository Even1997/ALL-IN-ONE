import type { AgentProviderId, AgentTurnRecord } from '../agentRuntimeTypes';

const createTurnId = () => `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const EMPTY_RUNTIME_RESPONSE_MESSAGE = 'No response content was returned.';

const createRuntimeTurn = (input: {
  id?: string;
  threadId: string;
  providerId: AgentProviderId;
  prompt: string;
  status: AgentTurnRecord['status'];
  createdAt?: number;
  completedAt?: number | null;
}): AgentTurnRecord => {
  const createdAt = input.createdAt ?? Date.now();

  return {
    id: input.id || createTurnId(),
    threadId: input.threadId,
    providerId: input.providerId,
    status: input.status,
    prompt: input.prompt,
    createdAt,
    completedAt: input.completedAt ?? null,
  };
};

export const createQueuedRuntimeTurn = (input: {
  threadId: string;
  providerId: AgentProviderId;
  prompt: string;
  createdAt?: number;
}) =>
  createRuntimeTurn({
    threadId: input.threadId,
    providerId: input.providerId,
    prompt: input.prompt,
    status: 'queued',
    createdAt: input.createdAt,
  });

export const createRunningRuntimeTurn = (input: {
  id?: string;
  threadId: string;
  providerId: AgentProviderId;
  prompt: string;
  createdAt?: number;
}) =>
  createRuntimeTurn({
    id: input.id,
    threadId: input.threadId,
    providerId: input.providerId,
    prompt: input.prompt,
    status: 'running',
    createdAt: input.createdAt,
  });

export const completeRuntimeTurn = (turn: AgentTurnRecord, completedAt = Date.now()): AgentTurnRecord => ({
  ...turn,
  status: 'completed',
  completedAt,
});

export const failRuntimeTurn = (turn: AgentTurnRecord, completedAt = Date.now()): AgentTurnRecord => ({
  ...turn,
  status: 'failed',
  completedAt,
});

export const startRuntimeTurnLifecycle = (input: {
  turnId?: string;
  threadId: string;
  providerId: AgentProviderId;
  prompt: string;
  createdAt?: number;
  submitTurn: (threadId: string, turn: AgentTurnRecord) => void;
  startRun: (threadId: string) => void;
}): AgentTurnRecord => {
  const turn = createRunningRuntimeTurn({
    id: input.turnId,
    threadId: input.threadId,
    providerId: input.providerId,
    prompt: input.prompt,
    createdAt: input.createdAt,
  });

  input.submitTurn(input.threadId, turn);
  input.startRun(input.threadId);

  return turn;
};

export const completeRuntimeTurnLifecycle = (input: {
  turn: AgentTurnRecord;
  completedAt?: number;
  submitTurn: (threadId: string, turn: AgentTurnRecord) => void;
  finishRun: (threadId: string) => void;
}): AgentTurnRecord => {
  const turn = completeRuntimeTurn(input.turn, input.completedAt);
  input.submitTurn(turn.threadId, turn);
  input.finishRun(turn.threadId);
  return turn;
};

export const failRuntimeTurnLifecycle = (input: {
  turn: AgentTurnRecord;
  error: string;
  completedAt?: number;
  submitTurn: (threadId: string, turn: AgentTurnRecord) => void;
  failRun: (threadId: string, error: string) => void;
}): AgentTurnRecord => {
  const turn = failRuntimeTurn(input.turn, input.completedAt);
  input.submitTurn(turn.threadId, turn);
  input.failRun(turn.threadId, input.error);
  return turn;
};

export const createRuntimeTurnController = (input: {
  turnId?: string;
  threadId: string;
  providerId: AgentProviderId;
  prompt: string;
  createdAt?: number;
  submitTurn: (threadId: string, turn: AgentTurnRecord) => void;
  startRun: (threadId: string) => void;
  finishRun: (threadId: string) => void;
  failRun: (threadId: string, error: string) => void;
}) => {
  let activeTurn = startRuntimeTurnLifecycle({
    turnId: input.turnId,
    threadId: input.threadId,
    providerId: input.providerId,
    prompt: input.prompt,
    createdAt: input.createdAt,
    submitTurn: input.submitTurn,
    startRun: input.startRun,
  });

  return {
    getTurn: () => activeTurn,
    complete: (completedAt?: number) => {
      activeTurn = completeRuntimeTurnLifecycle({
        turn: activeTurn,
        completedAt,
        submitTurn: input.submitTurn,
        finishRun: input.finishRun,
      });
      return activeTurn;
    },
    fail: (error: string, completedAt?: number) => {
      activeTurn = failRuntimeTurnLifecycle({
        turn: activeTurn,
        error,
        completedAt,
        submitTurn: input.submitTurn,
        failRun: input.failRun,
      });
      return activeTurn;
    },
  };
};

export const createRuntimeExecutionController = (input: {
  turnId?: string;
  threadId: string;
  providerId: AgentProviderId;
  prompt: string;
  createdAt?: number;
  submitTurn: (threadId: string, turn: AgentTurnRecord) => void;
  startRun: (threadId: string) => void;
  finishRun: (threadId: string) => void;
  failRun: (threadId: string, error: string) => void;
  appendReplayStart: (prompt: string) => Promise<void>;
  appendReplayOutcome: (eventType: 'turn_completed' | 'turn_failed', payload: string) => Promise<void>;
}) => {
  const turnController = createRuntimeTurnController({
    turnId: input.turnId,
    threadId: input.threadId,
    providerId: input.providerId,
    prompt: input.prompt,
    createdAt: input.createdAt,
    submitTurn: input.submitTurn,
    startRun: input.startRun,
    finishRun: input.finishRun,
    failRun: input.failRun,
  });

  return {
    getTurn: turnController.getTurn,
    start: async () => {
      await input.appendReplayStart(input.prompt);
      return turnController.getTurn();
    },
    completeWithReplay: async (payload: string, completedAt?: number) => {
      await input.appendReplayOutcome('turn_completed', payload);
      return turnController.complete(completedAt);
    },
    failWithReplay: async (payload: string, completedAt?: number) => {
      await input.appendReplayOutcome('turn_failed', payload);
      return turnController.fail(payload, completedAt);
    },
  };
};

export const createRuntimeReplayExecutionController = (input: {
  turnId?: string;
  threadId: string;
  providerId: AgentProviderId;
  prompt: string;
  replayStartPayload?: string;
  createdAt?: number;
  submitTurn: (threadId: string, turn: AgentTurnRecord) => void;
  startRun: (threadId: string) => void;
  finishRun: (threadId: string) => void;
  failRun: (threadId: string, error: string) => void;
  runtimeStoreThreadId: string;
  replayThreadId: string;
  appendAndSyncReplayEvent: (payload: {
    runtimeStoreThreadId: string;
    replayThreadId: string;
    eventType: string;
    payload: string;
  }) => Promise<unknown>;
}) =>
  createRuntimeExecutionController({
    turnId: input.turnId,
    threadId: input.threadId,
    providerId: input.providerId,
    prompt: input.prompt,
    createdAt: input.createdAt,
    submitTurn: input.submitTurn,
    startRun: input.startRun,
    finishRun: input.finishRun,
    failRun: input.failRun,
    appendReplayStart: async (prompt) => {
      await input.appendAndSyncReplayEvent({
        runtimeStoreThreadId: input.runtimeStoreThreadId,
        replayThreadId: input.replayThreadId,
        eventType: 'turn_started',
        payload: input.replayStartPayload || prompt,
      });
    },
    appendReplayOutcome: async (eventType, payload) => {
      await input.appendAndSyncReplayEvent({
        runtimeStoreThreadId: input.runtimeStoreThreadId,
        replayThreadId: input.replayThreadId,
        eventType,
        payload,
      });
    },
  });

const buildRuntimeStreamingMessage = (input: {
  thinkingContent: string;
  answerContent: string;
  completeThinking: boolean;
}) => {
  const sections: string[] = [];

  if (input.thinkingContent.trim()) {
    sections.push(
      input.completeThinking ? `<think>${input.thinkingContent}</think>` : `<think>${input.thinkingContent}`,
    );
  }

  if (input.answerContent.trim()) {
    sections.push(input.answerContent);
  }

  return sections.join('\n\n').trim() || 'Thinking...';
};

export type RuntimeStreamingAssistantDraft = {
  content: string;
  thinkingContent: string;
  answerContent: string;
  assistantParts: Array<
    | { type: 'thinking'; content: string; collapsed: boolean; createdAt?: number }
    | { type: 'text'; content: string; createdAt?: number }
  >;
};

const reconcileFinalAssistantParts = (
  response: string,
  parts: RuntimeStreamingAssistantDraft['assistantParts']
): RuntimeStreamingAssistantDraft['assistantParts'] | null => {
  const textPartIndexes = parts
    .map((part, index) => (part.type === 'text' ? index : -1))
    .filter((index) => index >= 0);

  if (textPartIndexes.length <= 1) {
    return null;
  }

  let cursor = 0;
  const lastTextPartIndex = textPartIndexes[textPartIndexes.length - 1]!;
  const reconciledParts: RuntimeStreamingAssistantDraft['assistantParts'] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!;
    if (part.type !== 'text') {
      reconciledParts.push(part);
      continue;
    }

    if (index !== lastTextPartIndex) {
      if (!response.startsWith(part.content, cursor)) {
        return null;
      }

      reconciledParts.push(part);
      cursor += part.content.length;
      continue;
    }

    const remainingContent = response.slice(cursor);
    if (!remainingContent) {
      return null;
    }

    reconciledParts.push({
      ...part,
      content: remainingContent,
    });
  }

  return reconciledParts;
};

const splitResponseIntoParagraphSlices = (response: string, segmentCount: number) => {
  if (segmentCount <= 1) {
    return null;
  }

  const paragraphs = response.match(/[\s\S]+?(?:\n\s*\n|$)/g)?.filter(Boolean) || [];
  if (paragraphs.length < segmentCount) {
    return null;
  }

  const slices: string[] = [];
  let cursor = 0;

  for (let index = 0; index < segmentCount; index += 1) {
    if (index < segmentCount - 1) {
      const paragraph = paragraphs[index]!;
      slices.push(paragraph);
      cursor += paragraph.length;
      continue;
    }

    const remainingContent = response.slice(cursor);
    if (!remainingContent) {
      return null;
    }
    slices.push(remainingContent);
  }

  return slices.join('') === response ? slices : null;
};

const reconcileFinalAssistantPartsByParagraph = (
  response: string,
  parts: RuntimeStreamingAssistantDraft['assistantParts']
): RuntimeStreamingAssistantDraft['assistantParts'] | null => {
  const textParts = parts.filter((part) => part.type === 'text');
  const paragraphSlices = splitResponseIntoParagraphSlices(response, textParts.length);
  if (!paragraphSlices) {
    return null;
  }

  let textPartIndex = 0;
  return parts.map((part) => {
    if (part.type !== 'text') {
      return part;
    }

    const nextContent = paragraphSlices[textPartIndex++];
    return {
      ...part,
      content: nextContent || part.content,
    };
  });
};

export const createRuntimeStreamingMessageAssembler = () => {
  let state: 'initial' | 'thinking' | 'answer' = 'initial';
  let thinkingContent = '';
  let answerContentRaw = '';
  let pendingText = '';
  let forceNewPart = false;
  const assistantParts: RuntimeStreamingAssistantDraft['assistantParts'] = [];

  const appendAssistantPartContent = (mode: 'thinking' | 'answer', value: string, collapsed: boolean) => {
    if (!value) {
      return;
    }

    const type = mode === 'thinking' ? 'thinking' : 'text';
    const lastPart = assistantParts[assistantParts.length - 1];
    if (!forceNewPart && lastPart?.type === type) {
      lastPart.content += value;
      return;
    }

    forceNewPart = false;
    assistantParts.push(
      type === 'thinking'
        ? { type: 'thinking', content: value, collapsed, createdAt: Date.now() }
        : { type: 'text', content: value, createdAt: Date.now() }
    );
  };

  const flushPendingText = (mode: 'thinking' | 'answer') => {
    if (!pendingText) {
      return;
    }

    if (mode === 'thinking') {
      thinkingContent += pendingText;
    } else {
      answerContentRaw += pendingText;
    }
    appendAssistantPartContent(mode, pendingText, mode === 'thinking');
    pendingText = '';
  };

  const discardPendingText = () => {
    pendingText = '';
  };

  const buildDraft = (completeThinking: boolean): RuntimeStreamingAssistantDraft => {
    const visibleAnswerContent = answerContentRaw;
    const visibleThinkingContent = thinkingContent;
    const visibleParts = assistantParts
      .map((part) => {
        const content = part.content;
        return content
          ? {
              ...part,
              content,
              ...(part.type === 'thinking' ? { collapsed: true } : {}),
            }
          : null;
      })
      .filter((part): part is RuntimeStreamingAssistantDraft['assistantParts'][number] => Boolean(part));

    return {
      content: buildRuntimeStreamingMessage({
        thinkingContent: visibleThinkingContent,
        answerContent: visibleAnswerContent,
        completeThinking,
      }),
      thinkingContent: visibleThinkingContent,
      answerContent: visibleAnswerContent,
      assistantParts: visibleParts,
    };
  };

  const appendChunk = (event: { kind: string; delta: string }) => {
      if (event.kind === 'thinking') {
        discardPendingText();
        state = 'thinking';
        thinkingContent += event.delta;
        appendAssistantPartContent('thinking', event.delta, true);
      } else if (state === 'thinking') {
        answerContentRaw += event.delta;
        appendAssistantPartContent('answer', event.delta, false);
        state = 'answer';
      } else if (state === 'answer') {
        answerContentRaw += event.delta;
        appendAssistantPartContent('answer', event.delta, false);
      } else {
        flushPendingText('answer');
        state = 'answer';
        answerContentRaw += event.delta;
        appendAssistantPartContent('answer', event.delta, false);
      }
  };

  return {
    appendChunk,
    buildDraft,
    append: (event: { kind: string; delta: string }) => {
      appendChunk(event);
      return buildDraft(false);
    },
    markToolBoundary: (): RuntimeStreamingAssistantDraft => {
      flushPendingText('answer');
      state = 'answer';
      forceNewPart = true;
      return buildDraft(false);
    },
    buildFinal: (response: string): RuntimeStreamingAssistantDraft => {
      if (state === 'initial') {
        flushPendingText('answer');
        state = 'answer';
      }

      const draft = buildDraft(true);
      let answerContent = draft.answerContent;
      let finalParts = draft.assistantParts;

      if (response && response !== answerContent) {
        answerContent = response;
        finalParts =
          reconcileFinalAssistantParts(response, draft.assistantParts) ||
          reconcileFinalAssistantPartsByParagraph(response, draft.assistantParts) || [
            ...draft.assistantParts.filter((part) => part.type === 'thinking'),
            {
              type: 'text',
              content: response,
              createdAt: Date.now(),
            },
          ];
      }

      const content =
        !draft.thinkingContent.trim() && !answerContent.trim()
          ? response || EMPTY_RUNTIME_RESPONSE_MESSAGE
          : buildRuntimeStreamingMessage({
              thinkingContent: draft.thinkingContent,
              answerContent,
              completeThinking: true,
            });

      return {
        content: content !== 'Thinking...' ? content : response || EMPTY_RUNTIME_RESPONSE_MESSAGE,
        thinkingContent: draft.thinkingContent,
        answerContent,
        assistantParts: finalParts,
      };
    },
  };
};
