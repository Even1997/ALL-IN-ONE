import type { StoredChatMessage } from '../../modules/ai/store/aiChatStore';
import { buildAssistantMessageParts, type AIChatMessagePart } from './aiChatMessageParts';

export type AssistantDraftState = {
  content: string;
  thinkingContent: string;
  answerContent: string;
  assistantParts: AIChatMessagePart[];
};

export type AssistantRenderItem =
  | { kind: 'thinking_lane'; key: string; part: AIChatMessagePart; index: number }
  | { kind: 'bubble_part'; key: string; part: AIChatMessagePart; index: number };

export type AssistantRenderModel = {
  content: string;
  isStreaming: boolean;
  items: AssistantRenderItem[];
  copyText: string;
};

const normalizeAssistantCopy = (value: string) => value.replace(/\s+/g, ' ').trim();

const shouldSuppressAssistantTextPart = (
  message: StoredChatMessage,
  part: AIChatMessagePart,
  bubbleCardCount: number
) => {
  if (part.type !== 'text' || bubbleCardCount === 0) {
    return false;
  }

  if (message.projectFileProposal || message.runtimeQuestion) {
    return true;
  }

  const hasRuntimeCards = Boolean(message.toolCalls?.length || message.runtimeEvents?.length);
  if (!hasRuntimeCards) {
    return false;
  }

  const normalized = normalizeAssistantCopy(part.content);
  if (!normalized) {
    return true;
  }

  return normalized.length <= 120;
};

export const buildAssistantRenderModel = (
  message: StoredChatMessage,
  draftState?: AssistantDraftState,
  bubbleCardCount = 0
): AssistantRenderModel => {
  const content = draftState?.content ?? message.content;
  const isStreaming = Boolean(draftState);
  const parts = buildAssistantMessageParts({
    content,
    assistantParts: draftState?.assistantParts ?? (message.assistantParts as AIChatMessagePart[] | undefined),
    thinkingContent: draftState?.thinkingContent ?? message.thinkingContent,
    answerContent: draftState?.answerContent ?? message.answerContent,
    thinkingCollapsed: isStreaming ? false : undefined,
  });

  const items = parts
    .filter((part) => !shouldSuppressAssistantTextPart(message, part, bubbleCardCount))
    .map((part, index) => ({
      kind: part.type === 'thinking' ? 'thinking_lane' : 'bubble_part',
      key: `${message.id}-part-${index}`,
      part,
      index,
    })) as AssistantRenderItem[];

  return {
    content,
    isStreaming,
    items,
    copyText: (draftState?.answerContent ?? message.answerContent ?? '').trim(),
  };
};
