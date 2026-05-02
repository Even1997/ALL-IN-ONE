export const DEFAULT_CONTEXT_WINDOW_TOKENS = 258000;

export const estimateTextTokens = (text: string) => {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }

  return Math.ceil(normalized.length / 4);
};

export const formatTokenCount = (value: number) => {
  if (value >= 1000) {
    const compact = value / 1000;
    const digits = compact >= 100 ? 0 : 1;
    return `${compact.toFixed(digits).replace(/\.0$/, '')}k`;
  }

  return String(value);
};

export const buildContextUsageSummary = (sections: string[], limitTokens = DEFAULT_CONTEXT_WINDOW_TOKENS) => {
  const usedTokens = sections.reduce((total, section) => total + estimateTextTokens(section), 0);
  const safeLimit = Math.max(1000, Number.isFinite(limitTokens) ? limitTokens : DEFAULT_CONTEXT_WINDOW_TOKENS);

  return {
    usedTokens,
    limitTokens: safeLimit,
    usedLabel: formatTokenCount(usedTokens),
    limitLabel: formatTokenCount(safeLimit),
    ratio: safeLimit > 0 ? usedTokens / safeLimit : 0,
  };
};
