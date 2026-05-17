// 文件作用：assistant 渲染模型，位于聊天工作台前端展示层。
// 所在链路：负责把 runtime 与 store 投影结果组织成聊天界面。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import type { StoredChatMessage } from '../../modules/ai/store/aiChatStore.ts';
// 这个 render model 负责把 assistant message 里的 timeline 和文本事实整理成最终可渲染结构。
// 它位于 timeline / canonical truth 与 UI 组件之间，主要解决“前端该如何读这些事实”。
// 如果你在排查“assistant 最终展示内容为什么和时间线不一致”，先看这里。
import {
  type AssistantTimelineTextEvent,
  type AssistantTimelineEvent,
} from '../../modules/ai/store/assistantTimeline.ts';
import type { AIChatMessagePart } from './aiChatMessageParts.ts';

// assistantRenderModel 负责把 assistant timeline 压成最终 UI lane：
// - thinking -> thinking_lane
// - 中间文本反馈 -> feedback_lane
// - 最终答复 -> answer_lane
// 如果问题是“为什么同一条消息会拆成过程区和最终答案区”，从这里看最直接。
export type AssistantDraftState = {
  timeline: AssistantTimelineEvent[];
  isStreaming?: boolean;
  streamingStartedAt?: number;
  streamingUpdatedAt?: number;
};

export type AssistantRenderItem =
  | { kind: 'thinking_lane'; key: string; part: AIChatMessagePart; index: number; timelineOrder: number }
  | { kind: 'feedback_lane'; key: string; part: AIChatMessagePart; index: number; timelineOrder: number }
  | { kind: 'answer_lane'; key: string; part: AIChatMessagePart; index: number; timelineOrder: number };

type AssistantThinkingRenderItem = Extract<AssistantRenderItem, { kind: 'thinking_lane' }>;
type AssistantFeedbackRenderItem = Extract<AssistantRenderItem, { kind: 'feedback_lane' }>;
type AssistantAnswerRenderItem = Extract<AssistantRenderItem, { kind: 'answer_lane' }>;
type AssistantProcessRenderItem = AssistantThinkingRenderItem | AssistantFeedbackRenderItem;

export type AssistantRenderModel = {
  content: string;
  isStreaming: boolean;
  items: AssistantRenderItem[];
  processItems: AssistantProcessRenderItem[];
  finalAnswerItem: AssistantAnswerRenderItem | null;
  hasFinalAnswer: boolean;
  copyText: string;
};

const normalizeAssistantCopy = (value: string) => value.replace(/\s+/g, ' ').trim();

type AssistantTextTimelineBlock = {
  firstEventId: string;
  content: string;
  createdAt: number;
  timelineOrder: number;
};

// timeline 里的多个 text 事件不一定都代表最终答案。
// 这里先把文本块抽出来，后面再决定哪些归 feedback，哪些归 final answer。
const buildAssistantTextTimelineBlocks = (timeline: AssistantTimelineEvent[]) => {
  const blocks: AssistantTextTimelineBlock[] = [];

  timeline.forEach((event, timelineOrder) => {
    if (event.kind !== 'text') {
      return;
    }

    const content = event.content.trim();
    if (!content) {
      return;
    }

    blocks.push({
      firstEventId: event.id,
      content,
      createdAt: event.createdAt,
      timelineOrder,
    });
  });

  return blocks;
};

// render model 的核心职责是“把时间线转成界面语义”：
// - 最后一个文本块通常视为最终答案。
// - 前面的文本块视为过程反馈。
// - reasoning 单独保留到过程 lane，不并入最终答案。
export const buildAssistantRenderModel = (
  message: StoredChatMessage,
  draftState?: AssistantDraftState,
): AssistantRenderModel => {
  const isStreaming = draftState?.isStreaming ?? Boolean(draftState);
  const timeline = isStreaming
    ? Array.isArray(draftState?.timeline)
      ? draftState.timeline
      : message.role === 'assistant' && Array.isArray(message.timeline)
        ? message.timeline
        : []
    : message.role === 'assistant' && Array.isArray(message.timeline)
      ? message.timeline
      : [];
  const processItems: AssistantProcessRenderItem[] = [];
  const textBlocks = buildAssistantTextTimelineBlocks(timeline);
  // 最终正文应该来自“最后一个文本块”，而不是“最后一个 timeline 事件”。
  // 否则正文后面只要插入 approval / tool_result 之类的 runtime 卡片，就会把最终答案错误吃掉。
  const finalTextBlock = textBlocks.length > 0 ? textBlocks[textBlocks.length - 1]! : null;
  const feedbackTextBlocks = finalTextBlock ? textBlocks.slice(0, -1) : textBlocks;
  const content = finalTextBlock?.content || '';
  const fallbackAnswerCreatedAt =
    finalTextBlock?.createdAt
    ?? [...timeline]
      .reverse()
      .find((event): event is AssistantTimelineTextEvent => event.kind === 'text')
      ?.createdAt
    ?? message.createdAt;
  const answerCreatedAt = isStreaming
    ? draftState?.streamingStartedAt ?? fallbackAnswerCreatedAt
    : fallbackAnswerCreatedAt;

  timeline.forEach((event, timelineOrder) => {
    if (event.kind === 'reasoning') {
      const part = {
        type: 'thinking' as const,
        content: event.content,
        collapsed: event.collapsed,
        status: event.status,
        elapsedSeconds: event.elapsedSeconds,
        createdAt: event.createdAt,
      };
      if (part.content.trim().length === 0 && part.status !== 'streaming') {
        return;
      }

      processItems.push({
        kind: 'thinking_lane',
        key: `${message.id}-${event.id}`,
        part,
        index: processItems.length,
        timelineOrder,
      });
      return;
    }

    if (event.kind !== 'text' || finalTextBlock?.firstEventId === event.id) {
      return;
    }

    const feedbackBlock = feedbackTextBlocks.find((block) => block.firstEventId === event.id);
    if (!feedbackBlock) {
      return;
    }

    processItems.push({
      kind: 'feedback_lane',
      key: `${message.id}-${feedbackBlock.firstEventId}`,
      part: {
        type: 'text',
        content: feedbackBlock.content,
        createdAt: feedbackBlock.createdAt,
      },
      index: processItems.length,
      timelineOrder: feedbackBlock.timelineOrder,
    });
  });

  const normalizedContent = normalizeAssistantCopy(content);
  const shouldRenderAnswer = normalizedContent.length > 0;
  const finalAnswerItem: AssistantAnswerRenderItem | null = shouldRenderAnswer
    ? {
        kind: 'answer_lane',
        key: `${message.id}-answer-text`,
        part: {
          type: 'text',
          content,
          createdAt: answerCreatedAt,
        },
        index: processItems.length,
        timelineOrder: finalTextBlock?.timelineOrder ?? timeline.length,
      }
    : null;
  const items: AssistantRenderItem[] = finalAnswerItem ? [...processItems, finalAnswerItem] : processItems;

  return {
    content,
    isStreaming,
    items,
    processItems,
    finalAnswerItem,
    hasFinalAnswer: Boolean(finalAnswerItem),
    copyText: content,
  };
};
