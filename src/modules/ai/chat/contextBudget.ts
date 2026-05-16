// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 200000;

export const estimateTextTokens = (text: string) => {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }

  let tokens = 0;
  for (const ch of normalized) {
    const code = ch.codePointAt(0) ?? 0;
    // CJK Unified Ideographs, Extension A-F, Compatibility Ideographs
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2ebef) ||
      (code >= 0xf900 && code <= 0xfaff)
    ) {
      tokens += 1.5;
    } else if (
      // CJK punctuation, fullwidth forms, symbols
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      tokens += 1;
    } else if (code >= 0x80) {
      tokens += 0.5;
    } else {
      tokens += 0.25;
    }
  }

  return Math.ceil(tokens);
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
