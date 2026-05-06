import type { ReactNode } from 'react';

export type MessageTimelineRenderItem = {
  key: string;
  node: ReactNode;
  createdAt?: number;
};

export const sortMessageRenderItems = (
  partRenderItems: MessageTimelineRenderItem[],
  bubbleRenderItems: MessageTimelineRenderItem[]
) => {
  const timelineItems = [
    ...partRenderItems.map((item, index) => ({
      ...item,
      timelineIndex: index,
      source: 'part' as const,
    })),
    ...bubbleRenderItems.map((item, index) => ({
      ...item,
      timelineIndex: partRenderItems.length + index,
      source: 'bubble' as const,
    })),
  ];

  return timelineItems.sort((left, right) => {
    const leftTime = typeof left.createdAt === 'number' ? left.createdAt : Number.MAX_SAFE_INTEGER;
    const rightTime = typeof right.createdAt === 'number' ? right.createdAt : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime || left.timelineIndex - right.timelineIndex;
  });
};
