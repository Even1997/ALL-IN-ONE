// 文件作用：增量合并节流层，位于runtime sidecar 桥接层。
// 所在链路：负责把 sidecar 事件、快照与前端多个 store 接起来。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件负责把 sidecar 高频流式 delta 做轻量合并后再写入，是“流式写入节流层”。
// 它不改变 runtime 事实，只降低 store 写入频率和 UI 抖动，适合放在 sidecar 输出进入前端状态之前。
// 如果你在排查“流式输出太卡 / 界面频繁闪动 / delta 写入过密”，先看这里的调度与合并策略。
import type { RuntimeTurnDeltaTrace } from '@goodnight/runtime-protocol';

export type RuntimeSidecarDeltaApply = (
  sessionId: string,
  messageId: string,
  delta: string,
  emittedAt: number,
  trace?: RuntimeTurnDeltaTrace,
) => void;

export type RuntimeSidecarDeltaScheduler = (flush: () => void) => () => void;

// sidecar 流式输出会非常碎；这里用微任务 / 0ms 定时器把同一消息的后续 delta 合并后再刷。
// 目的不是改变事实，而是减少 store 写入频率和 UI 抖动。
const defaultScheduleFlush: RuntimeSidecarDeltaScheduler = (flush) => {
  let cancelled = false;

  if (typeof queueMicrotask === 'function') {
    queueMicrotask(() => {
      if (!cancelled) {
        flush();
      }
    });
    return () => {
      cancelled = true;
    };
  }

  const handle = setTimeout(() => {
    if (!cancelled) {
      flush();
    }
  }, 0);
  return () => {
    cancelled = true;
    clearTimeout(handle);
  };
};

// coalescer 处在“runtime 事实进入前端 store”之前的一层缓冲。
// 调试流式文本重复、顺序异常、或渲染太频繁时，可以优先看这里是否把 delta 合并错了。
export const createRuntimeSidecarDeltaCoalescer = (input: {
  applyDelta: RuntimeSidecarDeltaApply;
  scheduleFlush?: RuntimeSidecarDeltaScheduler;
}) => {
  const scheduleFlush = input.scheduleFlush || defaultScheduleFlush;
  const pending = new Map<string, {
    sessionId: string;
    messageId: string;
    delta: string;
    emittedAt: number;
    trace?: RuntimeTurnDeltaTrace;
  }>();
  let cancelScheduledFlush: (() => void) | null = null;

  const schedule = () => {
    if (cancelScheduledFlush) {
      return;
    }

    cancelScheduledFlush = scheduleFlush(flush);
  };

  function flush() {
    // flush 时统一消费当前批次，并清空 pending；
    // 每条消息只把累积出的“新增片段”推给 applyDelta。
    cancelScheduledFlush = null;
    const batch = [...pending.values()];
    pending.clear();
    batch.forEach((entry) => {
      if (!entry.delta) {
        return;
      }

      input.applyDelta(entry.sessionId, entry.messageId, entry.delta, entry.emittedAt, entry.trace);
    });
  }

  return {
    push(sessionId: string, messageId: string, delta: string, emittedAt: number, trace?: RuntimeTurnDeltaTrace) {
      if (!delta) {
        return;
      }

      const key = `${sessionId}\u0000${messageId}`;
      const existing = pending.get(key);
      if (!existing) {
        // 第一段 delta 立即落地，保证用户尽快看到响应；
        // 后续同消息的碎片再进入下一次 flush 合并。
        input.applyDelta(sessionId, messageId, delta, emittedAt, trace);
        pending.set(key, {
          sessionId,
          messageId,
          delta: '',
          emittedAt,
          trace,
        });
        schedule();
        return;
      }

      // 同一 session/message 的后续碎片只做文本拼接，不重复立刻写 store。
      pending.set(key, {
        ...existing,
        delta: `${existing.delta}${delta}`,
        emittedAt,
        trace: trace || existing.trace,
      });
      schedule();
    },
    flush,
    cancel() {
      // 取消通常用于会话切换、订阅清理或组件卸载，避免旧批次串进新上下文。
      cancelScheduledFlush?.();
      cancelScheduledFlush = null;
      pending.clear();
    },
  };
};
