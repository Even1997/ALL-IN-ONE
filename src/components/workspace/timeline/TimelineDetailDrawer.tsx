// 文件作用：抽屉组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React from 'react';
import type { TimelineDetailItem } from './timelineEventDetails.ts';

export const TimelineDetailDrawer: React.FC<{
  items: TimelineDetailItem[];
}> = ({ items }) => (
  <div className="chat-timeline-detail-drawer">
    {items.map((item) => (
      <div key={item.key} className={`chat-timeline-detail-line ${item.tone || 'default'}`}>
        <div className="chat-timeline-detail-copy">
          <strong>{item.label}</strong>
          {item.value
            ? item.mono
              ? (
                <pre
                  className="chat-timeline-detail-value chat-timeline-detail-value-mono"
                  title={item.value}
                >
                  {item.value}
                </pre>
              )
              : (
                <span
                  className="chat-timeline-detail-value chat-timeline-detail-value-text"
                  title={item.value}
                >
                  {item.value}
                </span>
              )
            : null}
        </div>
      </div>
    ))}
  </div>
);
