import type { RuntimeMessageRecord, RuntimeTurnDeltaTrace } from '@goodnight/runtime-protocol';

export type RuntimeSidecarDeltaApply = (
  sessionId: string,
  messageId: string,
  delta: string,
  emittedAt: number,
  trace?: RuntimeTurnDeltaTrace,
) => void;

export type RuntimeSidecarMessageApply = (
  sessionId: string,
  message: RuntimeMessageRecord,
  emittedAt: number,
) => void;

export type RuntimeSidecarDeltaScheduler = (flush: () => void) => () => void;

const defaultScheduleFlush: RuntimeSidecarDeltaScheduler = (flush) => {
  if (typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function') {
    const handle = requestAnimationFrame(() => flush());
    return () => cancelAnimationFrame(handle);
  }

  const handle = setTimeout(flush, 16);
  return () => clearTimeout(handle);
};

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
      cancelScheduledFlush?.();
      cancelScheduledFlush = null;
      pending.clear();
    },
  };
};

export const createRuntimeSidecarMessageCoalescer = (input: {
  applyMessage: RuntimeSidecarMessageApply;
  scheduleFlush?: RuntimeSidecarDeltaScheduler;
}) => {
  const scheduleFlush = input.scheduleFlush || defaultScheduleFlush;
  const pending = new Map<string, {
    sessionId: string;
    message: RuntimeMessageRecord | null;
    emittedAt: number;
  }>();
  let cancelScheduledFlush: (() => void) | null = null;

  const schedule = () => {
    if (cancelScheduledFlush) {
      return;
    }

    cancelScheduledFlush = scheduleFlush(flush);
  };

  function flush() {
    cancelScheduledFlush = null;
    const batch = [...pending.values()];
    pending.clear();
    batch.forEach((entry) => {
      if (!entry.message) {
        return;
      }

      input.applyMessage(entry.sessionId, entry.message, entry.emittedAt);
    });
  }

  return {
    push(sessionId: string, message: RuntimeMessageRecord, emittedAt: number) {
      const key = `${sessionId}\u0000${message.id}`;
      const existing = pending.get(key);
      if (!existing) {
        input.applyMessage(sessionId, message, emittedAt);
        pending.set(key, {
          sessionId,
          message: null,
          emittedAt,
        });
        schedule();
        return;
      }

      pending.set(key, {
        ...existing,
        sessionId,
        message,
        emittedAt,
      });
      schedule();
    },
    flush,
    cancel() {
      cancelScheduledFlush?.();
      cancelScheduledFlush = null;
      pending.clear();
    },
  };
};
