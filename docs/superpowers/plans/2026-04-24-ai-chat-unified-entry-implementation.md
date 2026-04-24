# AI Chat Unified Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the product to a chat-first AI entry, remove mock fallback behavior, and make both `openai-compatible` and `anthropic` providers usable for chat, workflow, connection testing, and model listing.

**Architecture:** Keep the existing workflow engine and project stores, but move initiation and control into the chat layer. Reuse the current workspace as the artifact surface and reduce the standalone AI workspace to a contextual panel instead of a separate entry flow.

**Tech Stack:** React 19, TypeScript, Zustand, Tauri, built-in Node test runner, existing AI workflow/store modules

---

### Task 1: Lock provider behavior behind real configuration

**Files:**
- Modify: `src/modules/ai/core/AIService.ts`
- Create: `tests/ai/ai-service.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { aiService } from '../../dist-test/modules/ai/core/AIService.js';

test('chat rejects requests when no api key is configured', async () => {
  aiService.setConfig({
    provider: 'openai-compatible',
    apiKey: '',
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
  });

  await assert.rejects(() => aiService.chat('hello'), /not configured/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsc --module es2022 --target es2022 --outDir dist-test src/modules/ai/core/AIService.ts src/components/workspace/tools.ts src/types/index.ts && node --test tests/ai/ai-service.test.mjs`
Expected: FAIL because `chat()` currently returns mock text instead of rejecting.

- [ ] **Step 3: Write minimal implementation**

```ts
async chat(prompt: string, handlers?: { onChunk?: (text: string) => void }): Promise<string> {
  if (!this.hasUsableCredentials()) {
    throw new Error('AI provider is not configured');
  }

  const content = await this.runAgentLoop(
    [{ role: 'user', content: prompt }],
    this.buildChatSystemPrompt(),
    undefined,
    handlers?.onChunk
      ? {
          onStart: () => undefined,
          onChunk: (chunk) => handlers.onChunk?.(chunk.content),
          onComplete: () => undefined,
          onError: () => undefined,
          onInterrupt: () => undefined,
        }
      : undefined
  );

  return content;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsc --module es2022 --target es2022 --outDir dist-test src/modules/ai/core/AIService.ts src/components/workspace/tools.ts src/types/index.ts && node --test tests/ai/ai-service.test.mjs`
Expected: PASS

- [ ] **Step 5: Expand coverage for provider helpers**

Add tests for:
- anthropic model list fallback behavior
- missing config connection test message
- helper that reports whether AI is actually configured

- [ ] **Step 6: Run focused tests again**

Run: `npx tsc --module es2022 --target es2022 --outDir dist-test src/modules/ai/core/AIService.ts src/components/workspace/tools.ts src/types/index.ts && node --test tests/ai/ai-service.test.mjs`
Expected: PASS

### Task 2: Make chat the driver for workflow entry

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/modules/ai/workflow/AIWorkflowService.ts`
- Modify: `src/store/projectStore.ts`

- [ ] **Step 1: Write the failing test**

```js
test('workflow package selection prefers requirements when only a brief exists', async () => {
  const pkg = chooseNextWorkflowPackage({
    hasRequirements: false,
    hasFeatureTree: false,
    hasPageStructure: false,
    hasWireframes: false,
  });

  assert.equal(pkg, 'requirements');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/ai-service.test.mjs`
Expected: FAIL because the helper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export const chooseNextWorkflowPackage = (state: {
  hasRequirements: boolean;
  hasFeatureTree: boolean;
  hasPageStructure: boolean;
  hasWireframes: boolean;
}): AIWorkflowPackage => {
  if (!state.hasRequirements || !state.hasFeatureTree) return 'requirements';
  if (!state.hasPageStructure || !state.hasWireframes) return 'prototype';
  return 'page';
};
```

- [ ] **Step 4: Connect AIChat to real workflow entry**

Implement these behaviors:
- when AI is unconfigured, show a real configuration-needed assistant message
- when a project brief is sent and AI is configured, save the brief to `rawRequirementInput`
- trigger `runAIWorkflowPackage(chooseNextWorkflowPackage(...))`
- summarize generated results in chat instead of mock tool output

- [ ] **Step 5: Run build verification**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors

### Task 3: Remove the standalone AI-first navigation path

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/ai/AIWorkspace.tsx`
- Modify: `src/components/workspace/Workspace.tsx`
- Modify: `src/modules/ai/store/globalAIStore.ts`

- [ ] **Step 1: Write the failing test**

Document the expected state in a small pure test:

```js
test('ai availability requires both a model and usable credentials', () => {
  assert.equal(isAIConfigured({ apiKey: '', model: 'gpt-4o-mini' }), false);
  assert.equal(isAIConfigured({ apiKey: 'sk-test', model: 'gpt-4o-mini' }), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/ai-service.test.mjs`
Expected: FAIL because `isAIConfigured` helper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement a shared helper in the AI layer and use it to:
- remove mock-configured states from the store
- make the AI tab stop being the primary entry path
- surface configuration through panel/settings only
- keep workspace chat available in product/develop contexts

- [ ] **Step 4: Run build verification**

Run: `npm run build`
Expected: build succeeds and the app still renders

### Task 4: Manual verification of the unified chat flow

**Files:**
- No code changes required unless issues are found

- [ ] **Step 1: Verify unconfigured behavior**

Run the app and confirm:
- chat stays visible
- sending a message yields a configuration-required response
- no mock/generated content appears

- [ ] **Step 2: Verify configured `openai-compatible` behavior**

Confirm:
- model list fetch works
- connection test works
- chat can start the workflow

- [ ] **Step 3: Verify configured `anthropic` behavior**

Confirm:
- connection test works
- model list behavior is explicit and usable
- chat can start the workflow

- [ ] **Step 4: Final verification**

Run: `npm run build`
Expected: PASS
