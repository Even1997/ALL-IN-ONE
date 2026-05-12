import { sanitizeAgentVisibleText } from '../../modules/ai/runtime/dispatch/agentEvents.ts';

export type AIChatMessagePart =
  | { type: 'text'; content: string; createdAt?: number }
  | {
      type: 'thinking';
      content: string;
      collapsed: boolean;
      status?: 'streaming' | 'completed';
      elapsedSeconds?: number;
      createdAt?: number;
    }
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

export const cleanVisibleAssistantText = (content: string) =>
  sanitizeAgentVisibleText(content);

const cleanThinkingAssistantText = (content: string) =>
  sanitizeAgentVisibleText(content);

const normalizePreferredNarrativeParts = (
  preferredAssistantParts: AIChatMessagePart[] | undefined,
  thinkingCollapsed?: boolean,
) =>
  (preferredAssistantParts || [])
    .map((part) => {
      if (part.type === 'thinking') {
        const content = cleanThinkingAssistantText(part.content);
        if (!content) {
          return null;
        }

        return {
          ...part,
          content,
          collapsed: thinkingCollapsed ?? part.collapsed,
        } as Extract<AIChatMessagePart, { type: 'thinking' }>;
      }

      if (part.type === 'text') {
        const content = cleanVisibleAssistantText(part.content);
        if (!content) {
          return null;
        }

        return {
          ...part,
          content,
        } as Extract<AIChatMessagePart, { type: 'text' }>;
      }

      return null;
    })
    .filter(
      (
        part,
      ): part is Extract<AIChatMessagePart, { type: 'thinking' }> | Extract<AIChatMessagePart, { type: 'text' }> =>
        Boolean(part),
    );

export const buildAssistantMessageParts = (input: {
  content?: string;
  thinkingContent?: string;
  answerContent?: string;
  assistantParts?: AIChatMessagePart[];
  thinkingCollapsed?: boolean;
}): AIChatMessagePart[] => {
  const preferredParts = normalizePreferredNarrativeParts(
    input.assistantParts,
    input.thinkingCollapsed,
  );
  if (preferredParts.length > 0) {
    return preferredParts;
  }

  const parts: AIChatMessagePart[] = [];
  const thinkingContent = cleanThinkingAssistantText(input.thinkingContent || '');
  const answerContent = cleanVisibleAssistantText(input.answerContent || input.content || '');

  if (thinkingContent) {
    parts.push({
      type: 'thinking',
      content: thinkingContent,
      collapsed: input.thinkingCollapsed ?? true,
    });
  }

  if (answerContent) {
    parts.push({
      type: 'text',
      content: answerContent,
    });
  }

  return parts;
};

export const extractAssistantMessageContent = (content: string) => {
  const answerContent = cleanVisibleAssistantText(content);
  return {
    thinkingContent: '',
    answerContent,
    hasExecutionBlocks: false,
  };
};

export const buildStoredAssistantParts = (input: {
  thinkingContent?: string;
  answerContent?: string;
  thinkingCollapsed?: boolean;
  preferredAssistantParts?: AIChatMessagePart[];
}) =>
  buildAssistantMessageParts({
    thinkingContent: input.thinkingContent,
    answerContent: input.answerContent,
    assistantParts: input.preferredAssistantParts,
    thinkingCollapsed: input.thinkingCollapsed,
  });

export const serializeAssistantMessageParts = (parts: AIChatMessagePart[]) =>
  parts
    .flatMap((part) => (part.type === 'text' && part.content.trim() ? [part.content.trim()] : []))
    .join('\n\n')
    .trim();

export const buildAssistantStructuredContentState = (input: {
  content?: string;
  fallbackThinkingContent?: string;
  preferredAssistantParts?: AIChatMessagePart[];
  thinkingCollapsed?: boolean;
}): AssistantStructuredContentState => {
  const preferredParts = normalizePreferredNarrativeParts(
    input.preferredAssistantParts,
    input.thinkingCollapsed ?? true,
  );
  const fallbackThinkingContent = cleanThinkingAssistantText(input.fallbackThinkingContent || '');
  const contentAnswer = cleanVisibleAssistantText(input.content || '');
  const assistantParts =
    preferredParts.length > 0
      ? preferredParts
      : buildAssistantMessageParts({
          thinkingContent: fallbackThinkingContent,
          answerContent: contentAnswer,
          thinkingCollapsed: input.thinkingCollapsed ?? true,
        });
  const thinkingContent = assistantParts
    .filter((part) => part.type === 'thinking')
    .map((part) => part.content.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
  const answerContent = assistantParts
    .filter((part) => part.type === 'text')
    .map((part) => part.content.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

  return {
    content: serializeAssistantMessageParts(assistantParts) || contentAnswer,
    thinkingContent,
    answerContent,
    assistantParts,
  };
};

export const extractStoredAssistantPartsFromContent = (
  content: string,
  _thinkingCollapsed = true,
) => parseAIChatMessageParts(content);

export const parseAIChatMessageParts = (content: string): AIChatMessagePart[] => {
  const text = cleanVisibleAssistantText(content);
  return text ? [{ type: 'text', content: text }] : [];
};
