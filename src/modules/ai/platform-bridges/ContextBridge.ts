import type { PlatformPromptContext } from './types';

export interface ContextBridge {
  buildPromptContext(): Promise<PlatformPromptContext>;
}
