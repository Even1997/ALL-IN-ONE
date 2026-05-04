const INTERNAL_RESPONSE_PATTERNS = [
  /m-flow/i,
  /鍊欓€夐潰/,
  /\bRoute\b.*璇嗗埆/,
  /璇嗗埆鍊欓€夐潰/,
  /(^|[/\\])_goodnight([/\\]|$)/i,
  /(^|[/\\])\.goodnight([/\\]|$)/i,
  /(^|[/\\])\.ai([/\\]|$)/i,
  /\bGOODNIGHT\.md\b/i,
  /\bCLAUDE\.md\b/i,
];

const INTERNAL_RESPONSE_BLOCK_PATTERNS = [
  /<apply_skill\b[^>]*>[\s\S]*?<\/apply_skill>/gi,
  /<\s*\|\s*DSML\b[\s\S]*?<\s*\|\/\s*DSML\b[\s\S]*?(?=(?:\n\s*\n)|$)/gi,
];

const INTERNAL_RESPONSE_LINE_PATTERNS = [/^\s*(?:let me|allow me|我先|让我先).*(?:skill|技能).*\s*$/i];

const INTERNAL_RESPONSE_PROTOCOL_LINE_PATTERNS = [
  /(?:DSML|tool_calls>|invoke name=|parameter name=|string="true"|string="false")/i,
];

export const sanitizeInternalWorkspaceMentions = (value: string) => {
  const normalized = INTERNAL_RESPONSE_BLOCK_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, ''),
    value.replace(/\r/g, '')
  );
  const lines = normalized.split('\n');
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return true;
    }

    if (INTERNAL_RESPONSE_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      return false;
    }

    if (INTERNAL_RESPONSE_PROTOCOL_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      return false;
    }

    return !INTERNAL_RESPONSE_PATTERNS.some((pattern) => pattern.test(trimmed));
  });

  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};
