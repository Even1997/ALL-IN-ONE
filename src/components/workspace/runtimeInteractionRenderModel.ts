// 文件作用：runtime 交互渲染模型，位于聊天工作台前端展示层。
// 所在链路：负责把 runtime 与 store 投影结果组织成聊天界面。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import type {
// 这个 render model 专门从 assistant timeline 里提取“需要渲染成交互卡片”的 runtime 事件。
// 它负责把 approval、question、runtime event 等结构筛选并转换成 UI 需要的轻量视图。
// 如果你在排查“某个 runtime 事件明明存在却没进交互卡片区”，先看这里。
  StoredChatMessage,
  StoredChatRuntimeEvent,
} from '../../modules/ai/store/aiChatStore.ts';

// 这个 render model 很轻量，专门负责从 assistant message.timeline 里
// 抽出“需要渲染成交互卡片”的 runtime 事件。
export type RuntimeInteractionTimelineEvent = Extract<
  StoredChatRuntimeEvent,
  { kind: 'approval' | 'question' }
>;

export type RuntimeInteractionRenderEntry = {
  event: RuntimeInteractionTimelineEvent;
  createdAt: number;
  timelineOrder: number;
};

export type RuntimeApprovalRenderEntry = RuntimeInteractionRenderEntry & {
  event: Extract<RuntimeInteractionTimelineEvent, { kind: 'approval' }>;
};

export type RuntimeQuestionRenderEntry = RuntimeInteractionRenderEntry & {
  event: Extract<RuntimeInteractionTimelineEvent, { kind: 'question' }>;
};

// approval / question 本质上还是 timeline 事件，
// 这里只是补上 createdAt 和 timelineOrder，方便消息区稳定排序。
export const getRuntimeInteractionRenderEntries = (
  message: StoredChatMessage,
): RuntimeInteractionRenderEntry[] => {
  if (message.role !== 'assistant' || !Array.isArray(message.timeline)) {
    return [];
  }

  return message.timeline.flatMap((event, timelineOrder) => {
    if (event.kind !== 'approval' && event.kind !== 'question') {
      return [];
    }

    return [
      {
        event,
        createdAt: event.createdAt,
        timelineOrder,
      },
    ];
  });
};

export const getRuntimeApprovalRenderEntries = (
  message: StoredChatMessage,
): RuntimeApprovalRenderEntry[] =>
  getRuntimeInteractionRenderEntries(message).filter(
    (entry): entry is RuntimeApprovalRenderEntry => entry.event.kind === 'approval',
  );

export const getRuntimeQuestionRenderEntries = (
  message: StoredChatMessage,
): RuntimeQuestionRenderEntry[] =>
  getRuntimeInteractionRenderEntries(message).filter(
    (entry): entry is RuntimeQuestionRenderEntry => entry.event.kind === 'question',
  );
