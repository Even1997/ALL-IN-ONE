// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

export type ActivityEntryType =
  | 'run-summary'
  | 'document-changed'
  | 'artifact-created'
  | 'artifact-deleted'
  | 'confirmation-required'
  | 'conflict'
  | 'failed';

export type ActivityEntry = {
  id: string;
  runId: string;
  type: ActivityEntryType;
  summary: string;
  changedPaths: string[];
  runtime?: 'built-in' | 'local';
  skill?: string | null;
  createdAt: number;
};
