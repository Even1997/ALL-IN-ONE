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
  const metaItems = [
    card.toolCount > 0 ? `${card.toolCount} 个工具` : '',
    card.retryCount > 0 ? `${card.retryCount} 次重试` : '',
    card.warningCount > 0 ? `${card.warningCount} 条警告` : '',
    card.errorCount > 0 ? `${card.errorCount} 条错误` : '',
  ].filter(Boolean);

  return (
    <section className={`chat-timeline-card ${card.status}`}>
      <header className="chat-timeline-card-head">
        <div className="chat-timeline-card-copy">
          <div className="chat-timeline-card-kicker">
            <span className="chat-timeline-card-phase">{PHASE_LABELS[card.phase]}</span>
            {card.progressLabel ? <span className="chat-timeline-card-progress">{card.progressLabel}</span> : null}
          </div>
          <strong>{card.title}</strong>
        </div>
        <span className={`chat-timeline-card-status ${card.status}`}>{STATUS_LABELS[card.status]}</span>
      </header>
      <p className="chat-timeline-card-summary">{card.summary}</p>
      {metaItems.length > 0 ? (
        <div className="chat-timeline-card-meta">
          {metaItems.map((item) => (
            <span key={item} className="chat-timeline-card-chip">{item}</span>
          ))}
        </div>
      ) : null}
      {card.detailRefs.length > 0 ? (
        <button type="button" className="chat-timeline-card-toggle" onClick={onToggleDetails}>
          {detailsOpen ? '收起详情' : '查看详情'}
        </button>
      ) : null}
    </section>
  );
};
