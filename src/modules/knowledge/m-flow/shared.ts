const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'under',
  'over',
  'export',
  'const',
  'function',
  'return',
]);

export const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

export const summarizeText = (value: string, maxLength = 180) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
};

export const getFileStem = (value: string) => {
  const normalized = value.replace(/\\/g, '/').split('/').pop() || value;
  return normalized.replace(/\.[a-z0-9]+$/i, '') || normalized;
};

export const slugifyMFlowPart = (value: string) =>
  getFileStem(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';

export const splitIntoSentences = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .split(/[\n]+|(?<=[.!?])\s+/)
    .map((part) => normalizeWhitespace(part.replace(/^[-*]\s*/, '')))
    .filter((part) => part.length >= 4);

export const uniqueStrings = (values: string[]) => Array.from(new Set(values));

export const tokenizeSearchText = (value: string) =>
  uniqueStrings(
    value
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
  );
