// 文件作用：解析器，位于技能库与发现层。
// 所在链路：负责技能文件解析、目录发现和展示派生。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个解析器负责把 SKILL.md 的 frontmatter 和正文拆开，
// 输出给 skillLibrary / bundled skill definitions 继续组装 runtime skill。
// 这个文件负责把 SKILL.md 拆成 frontmatter 和正文，是技能加载链路最前面的解析层。
// 它只处理文本解析与结构提取，不决定技能是否启用、如何展示、如何注入 prompt。
// 如果你在排查“某个 skill 文件写了但没被系统正确读出来”，先从这里确认 frontmatter 和正文是否被正确拆解。
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
  ['user-tag-invocable']?: boolean;
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

// frontmatter 里的值可能包含数组、对象或引号，不能直接按第一个冒号切。
// 这里用一个轻量扫描器找“当前层级里真正的 key:value 分隔符”。
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

// 这里只支持 skill frontmatter 需要的那部分 YAML 标量 / 简单数组能力，
// 不追求完整 YAML 兼容，目标是稳定解析本项目的技能元数据。
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

// parseYamlBlock 是一个按缩进递归下降的小解析器，
// 负责把 frontmatter 中的对象 / 数组块还原成 JS 结构。
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

// 最终入口先拆 `--- frontmatter --- body`，再对常见列表字段做一次归一化。
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
