const STREAMING_BREAK_PATTERN = /[\s,.;:!?,\]\}]/;
const DEFAULT_FRAME_MS = 1000 / 60;
const DEFAULT_MIN_ADVANCE = 4;
const DEFAULT_MAX_ADVANCE = 24;
const DEFAULT_BASE_CHARS_PER_SECOND = 180;
const DEFAULT_BACKLOG_BOOST_FACTOR = 0.2;

const getStreamingNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const findCommonPrefixLength = (left: string, right: string) => {
  const limit = Math.min(left.length, right.length);
  let index = 0;

  while (index < limit && left[index] === right[index]) {
    index += 1;
  }

  return index;
};

const chooseAdvanceLength = (chunk: string, maxAdvance: number) => {
  if (chunk.length <= maxAdvance) {
    return chunk.length;
  }

  for (let index = Math.min(maxAdvance, chunk.length); index > 0; index -= 1) {
    if (STREAMING_BREAK_PATTERN.test(chunk[index - 1])) {
      return index;
    }
  }

  return maxAdvance;
};

export const advanceStreamingText = (current: string, target: string, maxAdvance = 6) => {
  if (current === target) {
    return current;
  }

  if (!target.startsWith(current)) {
    return target;
  }

  const remaining = target.slice(current.length);
  const nextAdvance = chooseAdvanceLength(remaining, Math.max(1, maxAdvance));
  return `${current}${remaining.slice(0, nextAdvance)}`;
};

export const createStreamingTextRevealController = (options?: {
  minAdvance?: number;
  maxAdvance?: number;
  baseCharsPerSecond?: number;
  backlogBoostFactor?: number;
}) => {
  let visible = '';
  let target = '';
  let carry = 0;
  let lastTickAt: number | null = null;

  const minAdvance = Math.max(1, options?.minAdvance ?? DEFAULT_MIN_ADVANCE);
  const maxAdvance = Math.max(minAdvance, options?.maxAdvance ?? DEFAULT_MAX_ADVANCE);
  const baseCharsPerSecond = Math.max(1, options?.baseCharsPerSecond ?? DEFAULT_BASE_CHARS_PER_SECOND);
  const backlogBoostFactor = Math.max(0, options?.backlogBoostFactor ?? DEFAULT_BACKLOG_BOOST_FACTOR);

  const resetPacing = () => {
    carry = 0;
    lastTickAt = null;
  };

  const resolveAdvanceLength = (remainingLength: number, now: number) => {
    const elapsedMs = lastTickAt === null ? DEFAULT_FRAME_MS : Math.max(1, now - lastTickAt);
    lastTickAt = now;

    const timeBudget = carry + elapsedMs * (baseCharsPerSecond / 1000);
    const timeAdvance = Math.floor(timeBudget);
    carry = timeBudget - timeAdvance;
    const backlogAdvance = Math.ceil(remainingLength * backlogBoostFactor);

    return Math.min(remainingLength, Math.max(minAdvance, timeAdvance, backlogAdvance));
  };

  return {
    setTarget(nextTarget: string) {
      target = nextTarget;
      if (!visible) {
        return;
      }

      if (target.startsWith(visible)) {
        return;
      }

      const commonPrefixLength = findCommonPrefixLength(visible, target);
      visible = target.slice(0, commonPrefixLength);
      resetPacing();
    },
    tick(now = getStreamingNow()) {
      if (visible === target) {
        lastTickAt = now;
        return false;
      }

      const remaining = target.slice(visible.length);
      const nextAdvance = resolveAdvanceLength(remaining.length, now);
      const nextVisible = advanceStreamingText(visible, target, Math.min(maxAdvance, nextAdvance));
      const changed = nextVisible !== visible;
      visible = nextVisible;
      return changed;
    },
    reset(nextValue = '') {
      visible = nextValue;
      target = nextValue;
      resetPacing();
    },
    getVisible() {
      return visible;
    },
    getTarget() {
      return target;
    },
    isComplete() {
      return visible === target;
    },
  };
};
