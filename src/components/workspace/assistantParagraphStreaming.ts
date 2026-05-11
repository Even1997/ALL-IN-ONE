export type ParagraphStreamingState = {
  rawText: string;
  visibleText: string;
  pendingText: string;
  lastFlushAt: number | null;
  lastInputAt: number | null;
  isComplete: boolean;
};

const PARAGRAPH_BOUNDARY_RE = /\n\s*\n/g;
const SENTENCE_BOUNDARY_RE = /[.!?。！？](?=(?:["')\]}]|$|\s))/g;
const CODE_FENCE_RE = /```/g;

const isInsideCodeFence = (text: string) => {
  const matches = text.match(CODE_FENCE_RE);
  return Boolean(matches && matches.length % 2 === 1);
};

const findLastParagraphBoundary = (buffer: string) => {
  let match: RegExpExecArray | null = null;
  let lastIndex = -1;

  PARAGRAPH_BOUNDARY_RE.lastIndex = 0;
  while ((match = PARAGRAPH_BOUNDARY_RE.exec(buffer)) !== null) {
    lastIndex = match.index + match[0].length;
  }

  return lastIndex;
};

const findLastSentenceBoundary = (buffer: string) => {
  let match: RegExpExecArray | null = null;
  let lastIndex = -1;

  SENTENCE_BOUNDARY_RE.lastIndex = 0;
  while ((match = SENTENCE_BOUNDARY_RE.exec(buffer)) !== null) {
    lastIndex = match.index + match[0].length;
  }

  return lastIndex;
};

const findFlushIndex = (buffer: string) => {
  if (!buffer || isInsideCodeFence(buffer)) {
    return -1;
  }

  const paragraphBoundaryIndex = findLastParagraphBoundary(buffer);
  if (paragraphBoundaryIndex >= 0) {
    return paragraphBoundaryIndex;
  }

  return findLastSentenceBoundary(buffer);
};

const buildPendingText = (state: ParagraphStreamingState, nextRawText: string) => {
  if (!state.rawText) {
    return nextRawText;
  }

  if (nextRawText.startsWith(state.rawText)) {
    return `${state.pendingText}${nextRawText.slice(state.rawText.length)}`;
  }

  const visiblePrefix = state.visibleText && nextRawText.startsWith(state.visibleText)
    ? state.visibleText
    : '';
  return nextRawText.slice(visiblePrefix.length);
};

export const createParagraphStreamingState = (): ParagraphStreamingState => ({
  rawText: '',
  visibleText: '',
  pendingText: '',
  lastFlushAt: null,
  lastInputAt: null,
  isComplete: false,
});

export const advanceParagraphStreamingState = (
  state: ParagraphStreamingState,
  nextRawText: string,
  now: number,
  options?: { forceTimeoutFlush?: boolean },
): ParagraphStreamingState => {
  const pendingText = buildPendingText(state, nextRawText);
  const flushIndex = findFlushIndex(pendingText);

  if (flushIndex >= 0) {
    const flushedText = pendingText.slice(0, flushIndex);
    return {
      rawText: nextRawText,
      visibleText: `${nextRawText.startsWith(state.visibleText) ? state.visibleText : ''}${flushedText}`,
      pendingText: pendingText.slice(flushIndex),
      lastFlushAt: now,
      lastInputAt: now,
      isComplete: false,
    };
  }

  if (options?.forceTimeoutFlush && pendingText.trim().length > 0) {
    return {
      rawText: nextRawText,
      visibleText: nextRawText,
      pendingText: '',
      lastFlushAt: now,
      lastInputAt: now,
      isComplete: false,
    };
  }

  return {
    rawText: nextRawText,
    visibleText: nextRawText.startsWith(state.visibleText) ? state.visibleText : '',
    pendingText,
    lastFlushAt: state.lastFlushAt,
    lastInputAt: now,
    isComplete: false,
  };
};

export const finalizeParagraphStreamingState = (
  state: ParagraphStreamingState,
  finalText: string,
): ParagraphStreamingState => {
  if (state.visibleText === finalText && state.pendingText.length === 0) {
    return {
      ...state,
      rawText: finalText,
      lastInputAt: state.lastInputAt,
      isComplete: true,
    };
  }

  return {
    rawText: finalText,
    visibleText: finalText,
    pendingText: '',
    lastFlushAt: state.lastFlushAt,
    lastInputAt: state.lastInputAt,
    isComplete: true,
  };
};
