import type { ReactNode } from 'react';

export type ChatMessageTimelineRenderItem = {
  key: string;
  node: ReactNode;
  createdAt?: number;
  timelineOrder?: number;
  laneKind?: 'thinking_lane' | 'bubble' | 'answer_lane';
};

export type ChatMessageTimelineRenderGroup = {
  kind: 'thinking_lane' | 'bubble';
  items: ChatMessageTimelineRenderItem[];
};

export type ChatMessageTimelineRenderModel = {
  orderedItems: ChatMessageTimelineRenderItem[];
  processItems: ChatMessageTimelineRenderItem[];
  processGroups: ChatMessageTimelineRenderGroup[];
  finalAnswerItem: ChatMessageTimelineRenderItem | null;
};

const getRenderGroupKind = (item: ChatMessageTimelineRenderItem): ChatMessageTimelineRenderGroup['kind'] =>
  item.laneKind === 'thinking_lane' ? 'thinking_lane' : 'bubble';

export const sortChatMessageTimelineItems = (renderItems: ChatMessageTimelineRenderItem[]) =>
  renderItems
    .map((item, index) => ({
      ...item,
      timelineIndex: index,
    }))
    .sort((left, right) => {
      const leftTime = typeof left.createdAt === 'number' ? left.createdAt : Number.MAX_SAFE_INTEGER;
      const rightTime = typeof right.createdAt === 'number' ? right.createdAt : Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      const leftTimelineOrder =
        typeof left.timelineOrder === 'number' ? left.timelineOrder : Number.MAX_SAFE_INTEGER;
      const rightTimelineOrder =
        typeof right.timelineOrder === 'number' ? right.timelineOrder : Number.MAX_SAFE_INTEGER;
      if (leftTimelineOrder !== rightTimelineOrder) {
        return leftTimelineOrder - rightTimelineOrder;
      }

      return left.timelineIndex - right.timelineIndex;
    })
    .map(({ timelineIndex: _timelineIndex, ...item }) => item);

export const groupChatMessageTimelineItemsByLane = (
  timelineItems: ChatMessageTimelineRenderItem[],
): ChatMessageTimelineRenderGroup[] => {
  const groups: ChatMessageTimelineRenderGroup[] = [];

  timelineItems.forEach((item) => {
    const kind = getRenderGroupKind(item);
    const previousGroup = groups[groups.length - 1];

    if (previousGroup?.kind === kind) {
      previousGroup.items.push(item);
      return;
    }

    groups.push({
      kind,
      items: [item],
    });
  });

  return groups;
};

export const buildChatMessageTimelineRenderModel = (input: {
  thinkingItems: ChatMessageTimelineRenderItem[];
  timelineCardItems: ChatMessageTimelineRenderItem[];
  activeResponseItem?: ChatMessageTimelineRenderItem | null;
  finalAnswerItem?: ChatMessageTimelineRenderItem | null;
}): ChatMessageTimelineRenderModel => {
  const orderedItems = sortChatMessageTimelineItems([
    ...input.thinkingItems,
    ...input.timelineCardItems,
    ...(input.activeResponseItem ? [input.activeResponseItem] : []),
    ...(input.finalAnswerItem ? [input.finalAnswerItem] : []),
  ]);
  const processItems = input.finalAnswerItem
    ? orderedItems.filter((item) => item.key !== input.finalAnswerItem?.key)
    : orderedItems;

  return {
    orderedItems,
    processItems,
    processGroups: groupChatMessageTimelineItemsByLane(processItems),
    finalAnswerItem: input.finalAnswerItem ?? null,
  };
};
