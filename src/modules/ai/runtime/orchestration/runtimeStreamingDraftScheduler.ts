export type RuntimeStreamingDraftScheduleFlush = (flush: () => void | Promise<void>) => () => void;

const defaultScheduleFlush: RuntimeStreamingDraftScheduleFlush = (flush) => {
  const handle = setTimeout(() => {
    void flush();
  }, 16);
  return () => clearTimeout(handle);
};

export const createRuntimeStreamingDraftScheduler = (input: {
  applyDraft: (active: boolean) => void | Promise<void>;
  scheduleFlush?: RuntimeStreamingDraftScheduleFlush;
}) => {
  const scheduleFlush = input.scheduleFlush || defaultScheduleFlush;
  let pendingActive: boolean | null = null;
  let cancelScheduledFlush: (() => void) | null = null;
  let flushChain = Promise.resolve();

  const schedule = () => {
    if (cancelScheduledFlush) {
      return;
    }

    cancelScheduledFlush = scheduleFlush(flush);
  };

  async function flush() {
    const active = pendingActive;
    pendingActive = null;
    cancelScheduledFlush?.();
    cancelScheduledFlush = null;

    if (active === null) {
      return;
    }

    flushChain = flushChain.then(() => input.applyDraft(active));
    await flushChain;
  }

  return {
    push(active: boolean) {
      pendingActive = active;
      schedule();
    },
    flush,
    cancel() {
      cancelScheduledFlush?.();
      cancelScheduledFlush = null;
      pendingActive = null;
    },
  };
};
