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

const formatCompactTime = (value: number) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

export const TimelineCard: React.FC<{
  card: TimelineCardModel;
  onToggleDetails: () => void;
  detailsOpen: boolean;
}> = ({ card, onToggleDetails, detailsOpen }) => {
  return (
    <section className={`chat-timeline-card ${card.status}`}>
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
          {card.status === 'completed' && typeof card.endedAt === 'number' ? (
            <>
              <span aria-hidden="true" className="chat-timeline-card-divider">
                路
              </span>
              <span className="chat-timeline-card-meta">{formatCompactTime(card.endedAt)} 完成</span>
            </>
          ) : null}
          {card.detailRefs.length > 0 ? (
            <>
              <span aria-hidden="true" className="chat-timeline-card-divider">
                ·
              </span>
              <button type="button" className="chat-timeline-card-toggle" onClick={onToggleDetails}>
                {detailsOpen ? '收起' : '详情'}
              </button>
            </>
          ) : null}
        </div>
      </header>
    </section>
  );
};
