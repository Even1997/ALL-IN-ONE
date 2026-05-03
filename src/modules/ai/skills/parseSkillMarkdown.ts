export type ParsedSkillFrontmatter = {
  name?: string;
  description?: string;
  when_to_use?: string;
  version?: string;
  package?: string;
  skill?: string;
  token?: string;
  aliases?: string[];
  context?: 'inline' | 'fork';
  arguments?: string[];
  ['argument-hint']?: string;
  agent?: string;
  model?: string;
  effort?: string;
  shell?: 'bash' | 'powershell';
  hooks?: unknown;
  paths?: string[];
  ['allowed-tools']?: string[];
  ['user-invocable']?: boolean;
  ['disable-model-invocation']?: boolean;
};

const normalizeListValue = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const stripWrappingQuotes = (value: string) =>
  (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
    ? value.slice(1, -1)
    : value;

const findYamlSeparatorIndex = (value: string) => {
  let quote: '"' | "'" | null = null;
  let squareDepth = 0;
  let braceDepth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote && value[index - 1] !== '\\') {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '[') {
      squareDepth += 1;
      continue;
    }

    if (char === ']') {
      squareDepth = Math.max(0, squareDepth - 1);
      continue;
    }

    if (char === '{') {
      braceDepth += 1;
      continue;
    }

    if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }

    if (char === ':' && squareDepth === 0 && braceDepth === 0) {
      return index;
    }
  }

  return -1;
};

const parseScalarValue = (rawValue: string) => {
  const value = rawValue.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value.startsWith('[') && value.endsWith(']')) {
    return normalizeListValue(value.slice(1, -1)).map(stripWrappingQuotes);
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return stripWrappingQuotes(value);
};

type ParsedYamlResult = {
  value: unknown;
  nextIndex: number;
};

const parseYamlBlock = (lines: string[], startIndex: number, indent: number): ParsedYamlResult => {
  let index = startIndex;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith('#')) {
      index += 1;
      continue;
    }
    break;
  }

  if (index >= lines.length) {
    return { value: {}, nextIndex: index };
  }

  const firstLine = lines[index];
  const firstIndent = firstLine.match(/^ */)?.[0].length || 0;
  const trimmedFirstLine = firstLine.trim();
  if (firstIndent < indent) {
    return { value: {}, nextIndex: index };
  }

  if (trimmedFirstLine.startsWith('- ')) {
    const items: unknown[] = [];

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        index += 1;
        continue;
      }

      const currentIndent = line.match(/^ */)?.[0].length || 0;
      if (currentIndent < indent || !trimmed.startsWith('- ')) {
        break;
      }

      const itemContent = trimmed.slice(2).trim();
      index += 1;

      if (!itemContent) {
        const nested = parseYamlBlock(lines, index, currentIndent + 2);
        items.push(nested.value);
        index = nested.nextIndex;
        continue;
      }

      const separatorIndex = findYamlSeparatorIndex(itemContent);
      if (separatorIndex > 0) {
        const key = itemContent.slice(0, separatorIndex).trim();
        const rawValue = itemContent.slice(separatorIndex + 1).trim();
        const item: Record<string, unknown> = {
          [key]: rawValue ? parseScalarValue(rawValue) : {},
        };
        const nested =
          index < lines.length &&
          ((lines[index].match(/^ */)?.[0].length || 0) > currentIndent)
            ? parseYamlBlock(lines, index, currentIndent + 2)
            : null;
        if (nested && nested.value && typeof nested.value === 'object' && !Array.isArray(nested.value)) {
          Object.assign(item, nested.value as Record<string, unknown>);
          index = nested.nextIndex;
        } else if (nested) {
          index = nested.nextIndex;
        }
        items.push(item);
        continue;
      }

      items.push(parseScalarValue(itemContent));
    }

    return { value: items, nextIndex: index };
  }

  const objectValue: Record<string, unknown> = {};

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      index += 1;
      continue;
    }

    const currentIndent = line.match(/^ */)?.[0].length || 0;
    if (currentIndent < indent || trimmed.startsWith('- ')) {
      break;
    }

    const separatorIndex = findYamlSeparatorIndex(trimmed);
    if (separatorIndex <= 0) {
      index += 1;
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    index += 1;

    if (!rawValue) {
      const nested = parseYamlBlock(lines, index, currentIndent + 2);
      objectValue[key] = nested.value;
      index = nested.nextIndex;
      continue;
    }

    objectValue[key] = parseScalarValue(rawValue);
  }

  return { value: objectValue, nextIndex: index };
};

const parseFrontmatterBlock = (frontmatterBlock: string) => {
  const lines = frontmatterBlock.split('\n');
  const parsed = parseYamlBlock(lines, 0, 0).value;
  return (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}) as Record<string, unknown>;
};

export const parseSkillMarkdown = (markdown: string) => {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!match) {
    return {
      frontmatter: {} as ParsedSkillFrontmatter,
      body: normalized.trim(),
    };
  }

  const [, frontmatterBlock, body] = match;
  const frontmatter = parseFrontmatterBlock(frontmatterBlock);

  if (typeof frontmatter.aliases === 'string') {
    frontmatter.aliases = normalizeListValue(frontmatter.aliases);
  }
  if (typeof frontmatter.arguments === 'string') {
    frontmatter.arguments = normalizeListValue(frontmatter.arguments);
  }
  if (typeof frontmatter.paths === 'string') {
    frontmatter.paths = normalizeListValue(frontmatter.paths);
  }
  if (typeof frontmatter['allowed-tools'] === 'string') {
    frontmatter['allowed-tools'] = normalizeListValue(frontmatter['allowed-tools']);
  }

  return {
    frontmatter: frontmatter as ParsedSkillFrontmatter,
    body: body.trim(),
  };
};
