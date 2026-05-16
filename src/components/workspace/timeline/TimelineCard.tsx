// 文件作用：卡片组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React from 'react';
import type { TimelineCard as TimelineCardModel } from '../../../modules/ai/runtime/composer/timelineComposerTypes.ts';

const STATUS_LABELS: Record<TimelineCardModel['status'], string> = {
  running: '进行中',
  completed: '已完成',
  failed: '失败',
  blocked: '等待中',
  cancelled: '已取消',
};

const PHASE_LABELS: Record<TimelineCardModel['phase'], string> = {
  intake: '启动',
  analysis: '分析',
  tooling: '工具',
  approval: '确认',
  question: '提问',
  response: '回复',
  error: '异常',
};

export const TimelineCard: React.FC<{
  card: TimelineCardModel;
  onToggleDetails: () => void;
  detailsOpen: boolean;
}> = ({ card, onToggleDetails, detailsOpen }) => {
  const hasDetails = card.detailRefs.length > 0;

  return (
    <section
      className={`chat-timeline-card ${card.status}${hasDetails ? ' is-disclosable' : ''}${detailsOpen ? ' is-open' : ''}`}
    >
      {hasDetails ? (
        <button
          type="button"
          className="chat-timeline-card-hitbox"
          onClick={onToggleDetails}
          aria-expanded={detailsOpen}
          aria-label={detailsOpen ? 'Collapse timeline details' : 'Expand timeline details'}
        />
      ) : null}
      <header className="chat-timeline-card-head">
        <div className="chat-timeline-card-main">
          <span className="chat-timeline-card-phase">{PHASE_LABELS[card.phase]}</span>
          <div className="chat-timeline-card-copy">
            <strong>{card.title}</strong>
            {card.progressLabel ? (
              <>
                <span aria-hidden="true" className="chat-timeline-card-divider">
                  /
                </span>
                <span className="chat-timeline-card-progress">{card.progressLabel}</span>
              </>
            ) : null}
            <span className="chat-timeline-card-summary-inline">{card.summary}</span>
            {card.toolCount > 0 ? (
              <>
                <span aria-hidden="true" className="chat-timeline-card-divider">
                  ·
                </span>
                <span className="chat-timeline-card-meta">{card.toolCount} 个工具</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="chat-timeline-card-actions">
          <span className={`chat-timeline-card-status ${card.status}`}>{STATUS_LABELS[card.status]}</span>
          {hasDetails ? (
            <span className="chat-inline-disclosure-caret chat-timeline-card-caret" aria-hidden="true" />
          ) : null}
        </div>
      </header>
    </section>
  );
};
