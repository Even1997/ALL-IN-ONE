export type AIChatMessagePart =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string; collapsed: boolean }
  | {
      type: 'tool';
      name: string;
      title: string;
      status: 'running' | 'success' | 'error';
      command?: string;
      input?: string;
      output?: string;
    };

const THINKING_PLACEHOLDERS = new Set(['Thinking...', 'Thinking…', '正在思考...', '正在思考…']);

const TOOL_LABELS: Record<string, string> = {
  bash: '运行终端命令',
  glob: '搜索文件',
  grep: '检索内容',
  ls: '查看目录',
  view: '读取文件',
  write: '写入文件',
  edit: '编辑文件',
  fetch: '访问网络',
};

const pushTextPart = (parts: AIChatMessagePart[], content: string) => {
  const normalized = content.trim();
  if (normalized) {
    parts.push({ type: 'text', content: normalized });
  }
};

const getToolTitle = (name: string) => TOOL_LABELS[name] || `调用 ${name}`;

const extractToolCommand = (name: string, rawParams: string) => {
  if (name !== 'bash') {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawParams) as { command?: unknown };
    return typeof parsed.command === 'string' ? parsed.command : undefined;
  } catch {
    return undefined;
  }
};

const normalizeToolInput = (rawParams: string) => {
  const normalized = rawParams.trim();
  return normalized || undefined;
};

export const parseAIChatMessageParts = (content: string): AIChatMessagePart[] => {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  if (THINKING_PLACEHOLDERS.has(trimmed)) {
    return [{ type: 'thinking', content: '', collapsed: false }];
  }

  const unfinishedThinkIndex = content.lastIndexOf('<think>');
  if (unfinishedThinkIndex !== -1 && content.indexOf('</think>', unfinishedThinkIndex) === -1) {
    const beforeThink = content.slice(0, unfinishedThinkIndex);
    const thinkingContent = content.slice(unfinishedThinkIndex + '<think>'.length).trim();
    const parts: AIChatMessagePart[] = [];
    pushTextPart(parts, beforeThink);
    parts.push({ type: 'thinking', content: thinkingContent, collapsed: false });
    return parts;
  }

  const parts: AIChatMessagePart[] = [];
  const pattern =
    /<think>[\s\S]*?<\/think>|<tool_use>\s*<tool name="(\w+)">([\s\S]*?)<\/tool>\s*<\/tool_use>|<tool_result name="([^"]+)"\s+(success|error)>\s*([\s\S]*?)\s*<\/tool_result>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    pushTextPart(parts, content.slice(lastIndex, match.index));

    if (match[0].startsWith('<think>')) {
      const thinkingMatch = match[0].match(/^<think>([\s\S]*?)<\/think>$/);
      parts.push({
        type: 'thinking',
        content: thinkingMatch?.[1]?.trim() || '',
        collapsed: true,
      });
    } else if (match[1]) {
      const name = match[1];
      const paramsMatch = match[2].match(/<tool_params>([\s\S]*?)<\/tool_params>/);
      const rawParams = paramsMatch?.[1] || '';
      parts.push({
        type: 'tool',
        name,
        title: getToolTitle(name),
        command: extractToolCommand(name, rawParams),
        input: normalizeToolInput(rawParams),
        status: 'running',
      });
    } else if (match[4]) {
      const toolName = match[3] || 'tool';
      parts.push({
        type: 'tool',
        name: toolName,
        title: getToolTitle(toolName),
        output: match[5].trim(),
        status: match[4] === 'error' ? 'error' : 'success',
      });
    }

    lastIndex = pattern.lastIndex;
  }

  pushTextPart(parts, content.slice(lastIndex));

  return parts;
};
