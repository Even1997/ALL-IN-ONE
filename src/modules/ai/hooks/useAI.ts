import { useCallback } from 'react';
import { useGlobalAIStore } from '../store/globalAIStore';
import { ChangeScope } from '../../../types';

export interface UseAIOptions {
  featureId?: string;
  featureName?: string;
}

export function useAI(module: 'feature-tree' | 'canvas' | 'code-editor' | 'backend' | 'bug-fix' | 'deploy') {
  const store = useGlobalAIStore();

  const generate = useCallback(
    async (
      action: 'generate' | 'modify' | 'review' | 'fix' | 'explain' | 'optimize',
      prompt: string,
      scope: ChangeScope,
      options?: UseAIOptions
    ) => {
      return store.generateForModule(
        module,
        action,
        scope,
        prompt,
        {
          featureId: options?.featureId,
          featureName: options?.featureName,
        }
      );
    },
    [module, store]
  );

  const explain = useCallback(
    async (prompt: string, scope: ChangeScope, options?: UseAIOptions) => {
      return store.generateForModule(
        module,
        'explain',
        scope,
        prompt,
        {
          featureId: options?.featureId,
          featureName: options?.featureName,
        }
      );
    },
    [module, store]
  );

  const review = useCallback(
    async (prompt: string, scope: ChangeScope, options?: UseAIOptions) => {
      return store.generateForModule(
        module,
        'review',
        scope,
        prompt,
        {
          featureId: options?.featureId,
          featureName: options?.featureName,
        }
      );
    },
    [module, store]
  );

  return {
    generate,
    explain,
    review,
    isStreaming: store.isStreaming,
    codeBlocks: store.codeBlocks,
    isPanelOpen: store.isPanelOpen,
    togglePanel: store.togglePanel,
    error: store.error,
  };
}

// Quick hook for simple AI calls
export function useQuickAI() {
  const store = useGlobalAIStore();

  const call = useCallback(
    async (
      module: 'feature-tree' | 'canvas' | 'code-editor' | 'backend' | 'bug-fix' | 'deploy',
      action: 'generate' | 'modify' | 'review' | 'fix' | 'explain' | 'optimize',
      prompt: string,
      scope: ChangeScope,
      context?: { featureId?: string; featureName?: string }
    ) => {
      return store.generateForModule(module, action, scope, prompt, context);
    },
    [store]
  );

  return { call, isStreaming: store.isStreaming, togglePanel: store.togglePanel };
}
