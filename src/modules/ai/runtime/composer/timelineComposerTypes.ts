// 文件作用：类型契约文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { CanonicalEvent } from '@goodnight/runtime-protocol';

export type TimelinePhase =
  | 'intake'
  | 'analysis'
  | 'tooling'
  | 'approval'
  | 'question'
  | 'response'
  | 'error';

export type TimelineCardStatus = 'running' | 'completed' | 'failed' | 'blocked' | 'cancelled';

export type TimelineCard = {
  cardId: string;
  phase: TimelinePhase;
  title: string;
  summary: string;
  status: TimelineCardStatus;
  startedAt: number;
  endedAt?: number;
  toolCount: number;
  retryCount: number;
  warningCount: number;
  errorCount: number;
  detailRefs: string[];
  interactionRefs: string[];
  progressLabel?: string;
  longRunning?: boolean;
};

export type TimelineMessageState = {
  messageId: string;
  text: string;
  startedAt: number;
  updatedAt: number;
  isStreaming: boolean;
};

export type TimelineCompletedMessageState = {
  messageId: string;
  text: string;
  completedAt: number;
};

export type TimelineProjection = {
  runId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  cards: TimelineCard[];
  activeMessage: TimelineMessageState | null;
  finalMessage: TimelineCompletedMessageState | null;
  events: CanonicalEvent[];
};

export type TimelineComposer = {
  append: (event: CanonicalEvent) => void;
  getProjection: () => TimelineProjection;
};
