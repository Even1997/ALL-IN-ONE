import type { ReactNode } from 'react';

export type MessageTimelineRenderItem = {
  key: string;
  node: ReactNode;
  createdAt?: number;
  timelineOrder?: number;
  laneKind?: 'thinking_lane' | 'bubble' | 'answer_lane';
};

export type MessageTimelineRenderGroup = {
  kind: 'thinking_lane' | 'bubble';
  items: MessageTimelineRenderItem[];
};

export const sortMessageRenderItems = (renderItems: MessageTimelineRenderItem[]) =>
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
  });

const getRenderGroupKind = (item: MessageTimelineRenderItem): MessageTimelineRenderGroup['kind'] =>
  item.laneKind === 'thinking_lane' ? 'thinking_lane' : 'bubble';

export const groupMessageRenderItemsByLane = (
  timelineItems: MessageTimelineRenderItem[]
): MessageTimelineRenderGroup[] => {
  const groups: MessageTimelineRenderGroup[] = [];

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
