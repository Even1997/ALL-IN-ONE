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
