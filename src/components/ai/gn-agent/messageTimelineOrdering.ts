import type { ReactNode } from 'react';

export type MessageTimelineRenderItem = {
  key: string;
  node: ReactNode;
  createdAt?: number;
  timelineOrder?: number;
  laneKind?: 'thinking_lane' | 'bubble';
};

export type MessageTimelineRenderGroup = {
  kind: 'thinking_lane' | 'bubble';
  items: MessageTimelineRenderItem[];
};

export const sortMessageRenderItems = (
  partRenderItems: MessageTimelineRenderItem[],
  bubbleRenderItems: MessageTimelineRenderItem[]
) => {
  const timelineItems = [
    ...partRenderItems.map((item, index) => ({
      ...item,
      timelineIndex: index,
    })),
    ...bubbleRenderItems.map((item, index) => ({
      ...item,
      timelineIndex: partRenderItems.length + index,
    })),
  ];

  return timelineItems.sort((left, right) => {
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
  });
};

export const groupMessageRenderItemsByLane = (
  timelineItems: MessageTimelineRenderItem[]
): MessageTimelineRenderGroup[] => {
  const groups: MessageTimelineRenderGroup[] = [];

  timelineItems.forEach((item) => {
    const kind = item.laneKind === 'thinking_lane' ? 'thinking_lane' : 'bubble';
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
