import type { AgentProviderId, AgentTurnRecord } from '../agentRuntimeTypes';

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
};

const STREAM_EXECUTION_MARKER_PATTERN =
  /<tool_use>|<\/tool_use>|<tool_result|<\/tool_result>|<apply_skill\b|<\s*\|\s*DSML\b|tool_calls>/i;
const STREAM_PROTOCOL_LINE_PATTERN =
  /^.*(?:DSML|tool_calls>|invoke name=|parameter name=|string="true"|string="false").*$/gim;
const STREAM_DSML_BLOCK_PATTERN = /<\s*\|\s*DSML\b[\s\S]*?(?=(?:\n\s*\n)|$)/gi;
const STREAM_PLANNING_PATTERN =
  /(?:^|[。！？\n])\s*(?:好的[,，]?\s*)?(?:我先|让我先|我需要先|我会接下来先|先去)(?:查看|看一下|看看|检查|读取|搜索|查找|分析|确认|了解|总结|扫描|定位)/;
const STREAM_ANSWER_SIGNAL_PATTERN =
  /(总结如下|结果如下|可以确认|我找到了|当前项目|项目中|结论|包含|如下|建议|答案|可以直接|已经)/;

const sanitizeStreamingVisibleText = (value: string) =>
  value
    .replace(STREAM_DSML_BLOCK_PATTERN, '')
    .replace(STREAM_PROTOCOL_LINE_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const normalizeStreamingClassifierText = (value: string) => value.replace(/\s+/g, ' ').trim();

const looksLikeStreamingPlanningText = (value: string) => {
  const normalized = normalizeStreamingClassifierText(value);
  if (!normalized) {
    return false;
  }

  if (STREAM_EXECUTION_MARKER_PATTERN.test(normalized)) {
    return true;
  }

  if (!STREAM_PLANNING_PATTERN.test(normalized)) {
    return false;
  }

  return !STREAM_ANSWER_SIGNAL_PATTERN.test(normalized);
};

const looksLikeStreamingAnswerText = (value: string) => {
  const normalized = normalizeStreamingClassifierText(value);
  if (!normalized || STREAM_EXECUTION_MARKER_PATTERN.test(normalized)) {
    return false;
  }

  return STREAM_ANSWER_SIGNAL_PATTERN.test(normalized) || normalized.length >= 220;
};

export const createRuntimeStreamingMessageAssembler = () => {
  let thinkingContent = '';
  let answerContentRaw = '';
  let pendingText = '';

  const flushPendingText = (mode: 'thinking' | 'answer') => {
    if (!pendingText) {
      return;
    }

    if (mode === 'thinking') {
      thinkingContent += pendingText;
    } else {
      answerContentRaw += pendingText;
    }

    pendingText = '';
  };

  return {
    append: (event: { kind: string; delta: string }) => {
      if (event.kind === 'thinking') {
        flushPendingText(looksLikeStreamingPlanningText(pendingText) ? 'thinking' : 'answer');
        thinkingContent += event.delta;
      } else if (answerContentRaw) {
        answerContentRaw += event.delta;
      } else {
        pendingText += event.delta;

        if (looksLikeStreamingPlanningText(pendingText)) {
          flushPendingText('thinking');
        } else if (looksLikeStreamingAnswerText(pendingText)) {
          flushPendingText('answer');
        }
      }

      const visibleAnswerContent = sanitizeStreamingVisibleText(
        answerContentRaw || (looksLikeStreamingPlanningText(pendingText) ? '' : pendingText),
      );

      return {
        content: buildRuntimeStreamingMessage({
          thinkingContent,
          answerContent: visibleAnswerContent,
          completeThinking: false,
        }),
        thinkingContent,
        answerContent: visibleAnswerContent,
      };
    },
    buildFinal: (response: string): RuntimeStreamingAssistantDraft => {
      flushPendingText(looksLikeStreamingPlanningText(pendingText) ? 'thinking' : 'answer');
      const answerContent = sanitizeStreamingVisibleText(answerContentRaw);
      const content = buildRuntimeStreamingMessage({
        thinkingContent,
        answerContent,
        completeThinking: true,
      });

      return {
        content: content !== '正在思考...' ? content : response.trim() || EMPTY_RUNTIME_RESPONSE_MESSAGE,
        thinkingContent,
        answerContent,
      };
    },
  };
};
