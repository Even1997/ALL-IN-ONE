// 文件作用：卡片集合组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React, { useState } from 'react';
import { TimelineCard } from './TimelineCard.tsx';
import { TimelineDetailDrawer } from './TimelineDetailDrawer.tsx';
import type { ChatTimelineBubbleCardDescriptor } from './chatTimelineBubbleCardModel.ts';
export { buildChatTimelineBubbleCards } from './chatTimelineBubbleCardModel.ts';

export const ChatTimelineBubbleCard: React.FC<{
  descriptor: ChatTimelineBubbleCardDescriptor;
}> = ({ descriptor }) => {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <>
      <TimelineCard
        card={descriptor.card}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((current) => !current)}
      />
      {detailsOpen && descriptor.detailItems.length > 0 ? (
        <TimelineDetailDrawer items={descriptor.detailItems} />
      ) : null}
    </>
  );
};
