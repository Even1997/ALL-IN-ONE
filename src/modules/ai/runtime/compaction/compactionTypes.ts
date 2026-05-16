// 文件作用：类型契约文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

export type CompactionReason = 'tool_results_trimmed' | 'old_turns_removed';

export type CompactionResult = {
  compacted: boolean;
  reason: CompactionReason;
  trimmedCount: number;
};

export type CompactOptions = {
  maxResultChars?: number;
  keepRecentRounds?: number;
  previewChars?: number;
};
