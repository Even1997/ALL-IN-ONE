// 文件作用：回放恢复层，位于replay 恢复层。
// 所在链路：负责从历史事件中恢复运行轨迹与恢复能力。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件负责从 replay 事件中恢复运行轨迹和关键上下文。
// 它主要服务于“历史回放、重建 turn 视图、从事件推断恢复状态”这类场景。
// 如果你在排查“为什么 replay 无法还原之前的运行事实”，先看这里。
import type { AgentReplayEvent } from '../agentRuntimeTypes';
import {
  parseRuntimeReplayTurnStartPayload,
  type RuntimeReplayTurnStartPayload,
} from './runtimeReplayPayload.ts';

// runtimeReplayRecovery 负责根据 replay 事件序列推断：
// - 上一次运行是正常完成、失败还是被打断。
// - 当前线程是否允许“恢复最近一次输入”或“重试上次失败”。
export type AgentReplayRecoveryState = {
  threadId: string;
  replayThreadId: string;
  replayEventCount: number;
  lastEventType: string | null;
  lastEventAt: number | null;
  lastOutcome: 'empty' | 'interrupted' | 'failed' | 'completed';
  resumeState: 'empty' | 'ready' | 'completed';
  resumeKind: 'none' | 'resume-latest-prompt' | 'retry-last-failed';
  resumeActionLabel: string | null;
  resumePrompt: string | null;
  resumeSkillSnapshot: RuntimeReplayTurnStartPayload | null;
  latestSkillSnapshot: RuntimeReplayTurnStartPayload | null;
  summary: string;
};

const sortReplayEvents = (events: AgentReplayEvent[]) =>
  [...events].sort((left, right) => left.createdAt - right.createdAt);

const isFailureEvent = (eventType: string) => eventType.endsWith('_failed');
const isCompletionEvent = (eventType: string) => eventType.endsWith('_completed');
const isTurnFailureEvent = (eventType: string) => eventType === 'turn_failed';

// 这个函数把一串 replay 事件压成“恢复判定结果”。
// 上层 UI 和 runtime 都不需要自己重新遍历事件，只读这个 recovery state 就够了。
export const buildReplayRecoveryState = (
  replayThreadId: string,
  events: AgentReplayEvent[],
): AgentReplayRecoveryState => {
  const sortedEvents = sortReplayEvents(events);
  const lastEvent = sortedEvents.length > 0 ? sortedEvents[sortedEvents.length - 1] : null;
  const lastStartedEvent =
    [...sortedEvents].reverse().find((event) => event.eventType === 'turn_started') || null;
  const lastStartedPayload = lastStartedEvent
    ? parseRuntimeReplayTurnStartPayload(lastStartedEvent.payload)
    : null;
  const resumePrompt =
    lastStartedEvent &&
    lastEvent &&
    !isCompletionEvent(lastEvent.eventType) &&
    (lastStartedPayload?.rawPrompt || lastStartedEvent.payload).trim()
      ? (lastStartedPayload?.rawPrompt || lastStartedEvent.payload).trim()
      : null;

  let lastOutcome: AgentReplayRecoveryState['lastOutcome'] = 'empty';
  let resumeState: AgentReplayRecoveryState['resumeState'] = 'empty';
  let resumeKind: AgentReplayRecoveryState['resumeKind'] = 'none';
  let resumeActionLabel: AgentReplayRecoveryState['resumeActionLabel'] = null;
  let summary = 'No replay events yet.';

  if (lastEvent) {
    if (resumePrompt) {
      lastOutcome = isFailureEvent(lastEvent.eventType) ? 'failed' : 'interrupted';
      resumeState = 'ready';
      if (isTurnFailureEvent(lastEvent.eventType)) {
        resumeKind = 'retry-last-failed';
        resumeActionLabel = '重试失败的运行';
        summary = 'Last run failed. The thread can retry from the latest prompt.';
      } else {
        resumeKind = 'resume-latest-prompt';
        resumeActionLabel = '恢复最近一次输入';
        summary = 'Last run was interrupted. The thread can resume from the latest prompt.';
      }
    } else {
      lastOutcome = 'completed';
      resumeState = 'completed';
      summary = 'Latest replay sequence completed cleanly.';
    }
  }

  return {
    threadId: replayThreadId,
    replayThreadId,
    replayEventCount: sortedEvents.length,
    lastEventType: lastEvent?.eventType || null,
    lastEventAt: lastEvent?.createdAt || null,
    lastOutcome,
    resumeState,
    resumeKind,
    resumeActionLabel,
    resumePrompt,
    resumeSkillSnapshot: resumePrompt ? lastStartedPayload : null,
    latestSkillSnapshot: lastStartedPayload,
    summary,
  };
};

export const getLatestReplaySkillSnapshot = (state: AgentReplayRecoveryState | null | undefined) =>
  state?.latestSkillSnapshot || null;

export const canResumeFromRecovery = (state: AgentReplayRecoveryState | null | undefined) =>
  Boolean(state && state.resumeState === 'ready' && state.resumePrompt);

// controller 把“写 replay 事件”和“同步 recovery state”绑定在一起，
// 这样外层不容易漏掉恢复状态刷新。
export const createReplayRecoveryController = (input: {
  appendReplayEvent: (payload: {
    threadId: string;
    eventType: string;
    payload: string;
  }) => Promise<AgentReplayEvent>;
  appendReplayEventToStore: (threadId: string, event: AgentReplayEvent) => void;
  getReplayEvents: (threadId: string) => AgentReplayEvent[];
  setRecoveryState: (threadId: string, state: AgentReplayRecoveryState) => void;
}) => ({
  syncFromEvents: (runtimeStoreThreadId: string, replayThreadId: string, events: AgentReplayEvent[]) => {
    const state = buildReplayRecoveryState(replayThreadId, events);
    input.setRecoveryState(runtimeStoreThreadId, state);
    return state;
  },
  appendAndSync: async (payload: {
    runtimeStoreThreadId: string;
    replayThreadId: string;
    eventType: string;
    payload: string;
  }) => {
    // 这是最常用入口：先写 replay event，再立刻重算 recovery state。
    const replayEvent = await input.appendReplayEvent({
      threadId: payload.replayThreadId,
      eventType: payload.eventType,
      payload: payload.payload,
    });
    input.appendReplayEventToStore(replayEvent.threadId, replayEvent);
    const state = buildReplayRecoveryState(
      replayEvent.threadId,
      input.getReplayEvents(replayEvent.threadId),
    );
    input.setRecoveryState(payload.runtimeStoreThreadId, state);
    return { replayEvent, state };
  },
});
