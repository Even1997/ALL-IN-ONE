import type { MessagePhase } from '@goodnight/runtime-protocol';

export type RuntimeMessagePhase = MessagePhase;

export const RUNTIME_MESSAGE_PHASES: RuntimeMessagePhase[] = [
  'commentary',
  'final_answer',
  'unknown',
];

export const normalizeRuntimeMessagePhase = (
  value: unknown,
): RuntimeMessagePhase => {
  if (value === 'commentary' || value === 'final_answer' || value === 'unknown') {
    return value;
  }
  return 'unknown';
};
