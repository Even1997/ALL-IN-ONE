import type { AgentProviderId, AgentTurnRecord } from '../agentRuntimeTypes';
import { sanitizeAgentVisibleText } from '../dispatch/agentEvents.ts';

const createTurnId = () => `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const EMPTY_RUNTIME_RESPONSE_MESSAGE = '已收到请求，但这次没有返回内容。';

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

  return sections.join('\n\n').trim() || '正在思考...';
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

const sanitizeStreamingVisibleText = sanitizeAgentVisibleText;
const sanitizeStreamingThinkingText = sanitizeAgentVisibleText;

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

  const buildDraft = (completeThinking: boolean): RuntimeStreamingAssistantDraft => {
    // Streaming 态下，tool 前的 pendingText 先按折叠 thinking 展示。
    // 一旦进入 answer 状态，只有正文继续作为可见 answer 输出。
    const visibleAnswerContent = sanitizeStreamingVisibleText(state === 'answer' ? answerContentRaw : '');
    const visibleThinkingContent = sanitizeStreamingThinkingText(
      state === 'answer' ? thinkingContent : `${thinkingContent}${pendingText}`
    );
    const visibleParts = assistantParts
      .map((part) => {
        const content =
          part.type === 'thinking'
            ? sanitizeStreamingThinkingText(part.content)
            : sanitizeStreamingVisibleText(part.content);
        return content
          ? {
              ...part,
              content,
              ...(part.type === 'thinking' ? { collapsed: true } : {}),
            }
          : null;
      })
      .filter((part): part is RuntimeStreamingAssistantDraft['assistantParts'][number] => Boolean(part));

    // Streaming 态下 pendingText 尚未归入 assistantParts，追加为折叠 thinking part。
    if (!completeThinking && pendingText && state !== 'answer') {
      const sanitizedPending = sanitizeStreamingThinkingText(pendingText);
      if (sanitizedPending) {
        visibleParts.push({
          type: 'thinking',
          content: sanitizedPending,
          collapsed: true,
          createdAt: Date.now(),
        });
      }
    }

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

  return {
    append: (event: { kind: string; delta: string }) => {
      if (event.kind === 'thinking') {
        // 模型的 native reasoning → 始终作为 thinking 内容
        flushPendingText('thinking');
        state = 'thinking';
        thinkingContent += event.delta;
        appendAssistantPartContent('thinking', event.delta, true);
      } else if (state === 'thinking') {
        // 已有 native thinking → text 是正文，直接送入 answer
        answerContentRaw += event.delta;
        appendAssistantPartContent('answer', event.delta, false);
        state = 'answer';
      } else if (state === 'answer') {
        // 已过 tool 边界或正文段 → text 直接送入 answer
        answerContentRaw += event.delta;
        appendAssistantPartContent('answer', event.delta, false);
      } else {
        // initial 态 → 尚未收到 native thinking，缓冲等待 tool 边界或流结束
        pendingText += event.delta;
      }

      return buildDraft(false);
    },
    markToolBoundary: (): RuntimeStreamingAssistantDraft => {
      // 没有 native thinking 时，tool 前的 text 是 pre-tool reasoning → 归入 thinking
      // 有 native thinking 时，text 已在 append 中直接进入 answer，pendingText 为空
      if (!thinkingContent.trim()) {
        flushPendingText('thinking');
      }
      state = 'answer';
      forceNewPart = true;
      return buildDraft(false);
    },
    buildFinal: (response: string): RuntimeStreamingAssistantDraft => {
      if (state === 'initial') {
        // 全程没有 native thinking 也没有 tool 调用 → pendingText 就是最终答案
        flushPendingText('answer');
        state = 'answer'; // buildDraft 依赖 state === 'answer' 来展示 answerContentRaw
      }
      // 其他情况：text 已在 append/markToolBoundary 中正确归位，无需处理

      const draft = buildDraft(true);

      const sanitizedResponse = sanitizeStreamingVisibleText(response);
      if (!draft.thinkingContent.trim() && !draft.answerContent.trim()) {
        draft.content = sanitizedResponse || EMPTY_RUNTIME_RESPONSE_MESSAGE;
      }
      const content = draft.content;

      return {
        content: content !== '正在思考...' ? content : sanitizedResponse || EMPTY_RUNTIME_RESPONSE_MESSAGE,
        thinkingContent: draft.thinkingContent,
        answerContent: draft.answerContent,
        assistantParts: draft.assistantParts,
      };
    },
  };
};
