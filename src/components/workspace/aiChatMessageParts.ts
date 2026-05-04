export type AIChatMessagePart =
  | { type: 'text'; content: string; createdAt?: number }
  | { type: 'thinking'; content: string; collapsed: boolean; createdAt?: number }
  | {
      type: 'tool';
      name: string;
      title: string;
      status: 'running' | 'success' | 'error';
      command?: string;
      input?: string;
      output?: string;
      createdAt?: number;
    };

export type AssistantStructuredContentState = {
  content: string;
  thinkingContent: string;
  answerContent: string;
  assistantParts: AIChatMessagePart[];
};

const THINKING_PLACEHOLDERS = new Set(['Thinking...', '正在思考...', '思考中...']);

const TOOL_LABELS: Record<string, string> = {
  bash: '运行终端命令',
  glob: '搜索文件',
  grep: '搜索内容',
  ls: '查看目录',
  view: '读取文件',
  write: '写入文件',
  edit: '编辑文件',
  fetch: '访问网络',
  terminal: '终端输出',
};

const RAW_DSML_TOOL_BLOCK_PATTERN =
  /<\s*\|\s*DSML\b[\s\S]*?<\s*\|\/\s*DSML\b[\s\S]*?(?=(?:\n\s*\n)|$)/gi;
const RAW_APPLY_SKILL_BLOCK_PATTERN = /<apply_skill\b[^>]*>[\s\S]*?<\/apply_skill>/gi;
const RAW_BARE_TOOL_BLOCK_PATTERN = /<tool name="(\w+)">[\s\S]*?<\/tool>/gi;
const RAW_INTERNAL_SKILL_LINE_PATTERN =
  /^(?:让我先用|我先用)\s+[`'"]?[\w-]+[`'"]?\s+技能[:：]?\s*$/gim;
const RAW_INTERNAL_PROTOCOL_LINE_PATTERN =
  /^.*(?:DSML|tool_calls>|invoke name=|parameter name=|string="true"|string="false"|<tool name=|<\/tool>|<tool_params>|<\/tool_params>).*\s*$/gim;

const RAW_ASSISTANT_EXECUTION_BLOCK_PATTERN =
  /<tool_use>\s*<tool name="(\w+)">([\s\S]*?)<\/tool>\s*<\/tool_use>|<tool name="(\w+)">([\s\S]*?)<\/tool>|<tool_result name="([^"]+)"\s+(success|error)>\s*([\s\S]*?)\s*<\/tool_result>|<apply_skill\b[^>]*>[\s\S]*?<\/apply_skill>|<\s*\|\s*DSML\b[\s\S]*?<\s*\|\/\s*DSML\b[\s\S]*?(?=(?:\n\s*\n)|$)/gi;

export const cleanVisibleAssistantText = (content: string) =>
  content
    .replace(RAW_DSML_TOOL_BLOCK_PATTERN, '')
    .replace(RAW_APPLY_SKILL_BLOCK_PATTERN, '')
    .replace(RAW_BARE_TOOL_BLOCK_PATTERN, '')
    .replace(RAW_INTERNAL_SKILL_LINE_PATTERN, '')
    .replace(RAW_INTERNAL_PROTOCOL_LINE_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const EXECUTION_PLANNING_LINE_PATTERN =
  /(?:^|[。！？\n])\s*(?:好的[,，]?\s*)?(?:我先|让我先|我需要先|我会接下来先|先去)(?:查看|看一下|看看|检查|读取|搜索|查找|分析|确认|了解|总结|扫描|定位)/;
const EXECUTION_ANSWER_SIGNAL_PATTERN =
  /(总结如下|结果如下|可以确认|我找到了|当前项目|项目中|结论|包含|如下|建议|答案|可以直接|已经)/;

const looksLikeExecutionPlanningText = (content: string) => {
  const normalized = cleanVisibleAssistantText(content);
  if (!normalized) {
    return false;
  }

  if (/[`#*|]/.test(normalized)) {
    return false;
  }

  if (/[:：]\s*$/.test(normalized)) {
    return false;
  }

  if (!EXECUTION_PLANNING_LINE_PATTERN.test(normalized)) {
    return false;
  }

  return !EXECUTION_ANSWER_SIGNAL_PATTERN.test(normalized);
};

const pushTextPart = (parts: AIChatMessagePart[], content: string) => {
  const normalized = cleanVisibleAssistantText(content);
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

const cleanThinkingAssistantText = (content: string) =>
  content
    .replace(RAW_DSML_TOOL_BLOCK_PATTERN, '')
    .replace(RAW_APPLY_SKILL_BLOCK_PATTERN, '')
    .replace(RAW_BARE_TOOL_BLOCK_PATTERN, '')
    .replace(RAW_INTERNAL_SKILL_LINE_PATTERN, '')
    .replace(RAW_INTERNAL_PROTOCOL_LINE_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const buildAssistantMessageParts = (input: {
  content?: string;
  thinkingContent?: string;
  answerContent?: string;
  assistantParts?: AIChatMessagePart[];
  thinkingCollapsed?: boolean;
}): AIChatMessagePart[] => {
  if (Array.isArray(input.assistantParts) && input.assistantParts.length > 0) {
    return input.assistantParts.map((part) =>
      part.type === 'thinking'
        ? {
            ...part,
            collapsed: input.thinkingCollapsed ?? part.collapsed,
          }
        : part
    );
  }

  const parts: AIChatMessagePart[] = [];

  if (input.thinkingContent?.trim()) {
    const thinkingContent = cleanThinkingAssistantText(input.thinkingContent);
    if (thinkingContent) {
      parts.push({
        type: 'thinking',
        content: thinkingContent,
        collapsed: input.thinkingCollapsed ?? false,
      });
    }
  }

  if (input.answerContent?.trim()) {
    parts.push({
      type: 'text',
      content: input.answerContent.trim(),
    });
  }

  if (parts.length > 0) {
    return parts;
  }

  return [];
};

export const extractAssistantMessageContent = (content: string) => {
  const trimmed = content.trim();
  if (!trimmed) {
    return {
      thinkingContent: '',
      answerContent: '',
      hasExecutionBlocks: false,
    };
  }

  if (THINKING_PLACEHOLDERS.has(trimmed)) {
    return {
      thinkingContent: '',
      answerContent: '',
      hasExecutionBlocks: false,
    };
  }

  const unfinishedThinkIndex = content.lastIndexOf('<think>');
  if (unfinishedThinkIndex !== -1 && content.indexOf('</think>', unfinishedThinkIndex) === -1) {
    return {
      thinkingContent: cleanThinkingAssistantText(content.slice(unfinishedThinkIndex + '<think>'.length)),
      answerContent: cleanVisibleAssistantText(content.slice(0, unfinishedThinkIndex)),
      hasExecutionBlocks: false,
    };
  }

  const explicitThinkingParts: string[] = [];
  const workingContent = content.replace(/<think>([\s\S]*?)<\/think>/g, (_, thinkingContent: string) => {
    const normalizedThinking = cleanThinkingAssistantText(thinkingContent);
    if (normalizedThinking) {
      explicitThinkingParts.push(normalizedThinking);
    }
    return '\n';
  });

  const textSegments: Array<{ text: string; afterExecution: boolean }> = [];
  let lastIndex = 0;
  let hasExecutionBlocks = false;
  let match: RegExpExecArray | null;

  while ((match = RAW_ASSISTANT_EXECUTION_BLOCK_PATTERN.exec(workingContent)) !== null) {
    const beforeBlock = cleanVisibleAssistantText(workingContent.slice(lastIndex, match.index));
    if (beforeBlock) {
      textSegments.push({ text: beforeBlock, afterExecution: hasExecutionBlocks });
    }
    hasExecutionBlocks = true;
    lastIndex = RAW_ASSISTANT_EXECUTION_BLOCK_PATTERN.lastIndex;
  }

  const trailingText = cleanVisibleAssistantText(workingContent.slice(lastIndex));
  if (trailingText) {
    textSegments.push({ text: trailingText, afterExecution: hasExecutionBlocks });
  }

  const answerSegments = hasExecutionBlocks
    ? textSegments.filter((segment) => segment.afterExecution).map((segment) => segment.text)
    : textSegments.map((segment) => segment.text);
  const preExecutionSegments = hasExecutionBlocks
    ? textSegments.filter((segment) => !segment.afterExecution).map((segment) => segment.text)
    : [];

  if (!hasExecutionBlocks && explicitThinkingParts.length === 0) {
    const provisionalAnswer = answerSegments.join('\n\n').trim();
    if (looksLikeExecutionPlanningText(provisionalAnswer)) {
      return {
        thinkingContent: provisionalAnswer,
        answerContent: '',
        hasExecutionBlocks: false,
      };
    }
  }

  return {
    thinkingContent: [...explicitThinkingParts, ...preExecutionSegments].filter(Boolean).join('\n\n').trim(),
    answerContent: answerSegments.join('\n\n').trim(),
    hasExecutionBlocks,
  };
};

export const buildStoredAssistantParts = (input: {
  thinkingContent?: string;
  answerContent?: string;
  thinkingCollapsed?: boolean;
}) => {
  const parts: AIChatMessagePart[] = [];

  if (input.thinkingContent?.trim()) {
    const thinkingContent = cleanThinkingAssistantText(input.thinkingContent);
    if (thinkingContent) {
      parts.push({
        type: 'thinking',
        content: thinkingContent,
        collapsed: input.thinkingCollapsed ?? false,
      });
    }
  }

  if (input.answerContent?.trim()) {
    parts.push({
      type: 'text',
      content: input.answerContent.trim(),
    });
  }

  return parts;
};

export const serializeAssistantMessageParts = (parts: AIChatMessagePart[]) =>
  parts
    .flatMap((part) => {
      if (part.type === 'thinking') {
        return part.content.trim() ? [`<think>${part.content.trim()}</think>`] : [];
      }

      if (part.type === 'text') {
        return part.content.trim() ? [part.content.trim()] : [];
      }

      return [];
    })
    .join('\n\n')
    .trim();

export const buildAssistantStructuredContentState = (input: {
  content?: string;
  fallbackThinkingContent?: string;
  preferredAssistantParts?: AIChatMessagePart[];
  thinkingCollapsed?: boolean;
}): AssistantStructuredContentState => {
  const extracted = extractAssistantMessageContent(input.content || '');
  const parsedThinkingContent = extracted.thinkingContent || cleanThinkingAssistantText(input.fallbackThinkingContent || '') || '';
  const parsedAnswerContent =
    extracted.answerContent ||
    (!parsedThinkingContent && !extracted.hasExecutionBlocks ? cleanVisibleAssistantText(input.content || '') : '');

  const preferredParts = Array.isArray(input.preferredAssistantParts) ? input.preferredAssistantParts : [];
  const preferredThinkingContent = preferredParts
    .filter((part) => part.type === 'thinking')
    .map((part) => cleanThinkingAssistantText(part.content))
    .filter(Boolean)
    .join('\n\n')
    .trim();
  const preferredAnswerContent = preferredParts
    .filter((part) => part.type === 'text')
    .map((part) => part.content.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

  const thinkingContent = parsedThinkingContent || preferredThinkingContent;
  const answerContent = parsedAnswerContent || preferredAnswerContent;
  const assistantParts = buildStoredAssistantParts({
    thinkingContent,
    answerContent,
    thinkingCollapsed: input.thinkingCollapsed ?? true,
  });
  const content = assistantParts.length > 0 ? serializeAssistantMessageParts(assistantParts) : cleanVisibleAssistantText(input.content || '');

  return {
    content,
    thinkingContent,
    answerContent,
    assistantParts,
  };
};

export const extractStoredAssistantPartsFromContent = (content: string, thinkingCollapsed = true) =>
  parseAIChatMessageParts(content).map((part) =>
    part.type === 'thinking'
      ? {
          ...part,
          collapsed: thinkingCollapsed,
        }
      : part
  );

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
    /<think>[\s\S]*?<\/think>|<tool_use>\s*<tool name="(\w+)">([\s\S]*?)<\/tool>\s*<\/tool_use>|<tool name="(\w+)">([\s\S]*?)<\/tool>|<tool_result name="([^"]+)"\s+(success|error)>\s*([\s\S]*?)\s*<\/tool_result>/g;
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
    } else if (match[1] || match[3]) {
      const name = match[1] || match[3];
      const rawToolBody = match[2] || match[4] || '';
      const paramsMatch = rawToolBody.match(/<tool_params>([\s\S]*?)<\/tool_params>/);
      const rawParams = paramsMatch?.[1] || '';
      parts.push({
        type: 'tool',
        name,
        title: getToolTitle(name),
        command: extractToolCommand(name, rawParams),
        input: normalizeToolInput(rawParams),
        status: 'running',
      });
    } else if (match[6]) {
      const toolName = match[5] || 'tool';
      parts.push({
        type: 'tool',
        name: toolName,
        title: getToolTitle(toolName),
        output: match[7].trim(),
        status: match[6] === 'error' ? 'error' : 'success',
      });
    }

    lastIndex = pattern.lastIndex;
  }

  pushTextPart(parts, content.slice(lastIndex));

  return parts;
};
