import type { PlatformSkillExecutionResult, PlatformSkillSummary } from './types';

export interface SkillBridge {
  listSkills(): Promise<PlatformSkillSummary[]>;
  executeSkill(skillId: string, input: string): Promise<PlatformSkillExecutionResult>;
}
