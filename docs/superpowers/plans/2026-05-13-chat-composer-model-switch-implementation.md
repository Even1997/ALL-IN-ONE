# Chat Composer Model Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a model switcher next to the chat composer so users can change the active runtime model from the input area, with a UI pattern close to the provided reference, while preserving the existing runtime/config architecture.

**Architecture:** Keep runtime truth at the existing `selectedRuntimeConfig -> submitRuntimeSidecarTurn(runtimeConfig)` boundary. Implement the new capability in the UI/config layer: the composer switcher changes the selected enabled config and/or the selected config's `model`, and the existing submit path consumes that updated config. Do not push chat-only display policy into provider adapters, canonical runtime events, or timeline/render-model layers.

**Tech Stack:** React 19, TypeScript, Zustand, local CSS, Node `--test` source assertions, Vite build

---

## File Structure

- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChat.tsx`
  Responsibility: wire the composer switcher into the default and embedded chat shells, pass active runtime state into the switcher, and keep submit flow unchanged.
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChat.css`
  Responsibility: style the trigger, dropdown, provider/model columns, compact state labels, and locked/disabled states.
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\ai\gn-agent\GNAgentEmbeddedPieces.tsx`
  Responsibility: expose a dedicated slot for the model switcher in the embedded composer toolbar instead of only rendering static text meta.
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChatComposerModelSwitcher.tsx`
  Responsibility: render the quick-switch trigger and popover UI, including provider/config list and model list.
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\useAIChatComposerModelSwitcherState.ts`
  Responsibility: derive enabled runtime configs, active model options, lock state, and immediate actions for selecting config/model from composer context.
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\useAIChatSettingsState.ts`
  Responsibility: extract or share model-catalog helpers so settings and composer switcher do not duplicate provider/model option logic.
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\global-ai-settings.test.mjs`
  Responsibility: replace the old “composer only shows static AI meta” expectation with source assertions for the new quick switcher while keeping settings-drawer coverage.
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\gn-agent-provider-lock.test.mjs`
  Responsibility: lock provider-embedded behavior so bound Claude/Codex stages stay config-scoped.
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\ai-chat-composer-model-switcher.test.mjs`
  Responsibility: source-level contract tests for the new trigger, menu layout, config/model actions, and disabled states.

## Product Decisions

- Composer quick switch is an **immediate operational action**, not a settings draft. Selecting a config updates `selectedConfigId`; selecting a model updates the active config via `updateConfig`.
- Default chat supports:
  - switching between enabled configs
  - switching models within the currently highlighted config
- Provider-embedded chat (`runtimeConfigIdOverride`) supports:
  - switching models for the bound config
  - no cross-config switching unless the override owner changes upstream
- If the active provider has cached/fetched model candidates, show them first; otherwise fall back to preset models plus the current `config.model`.
- This scope does **not** add a per-message ephemeral `modelOverride`. If the product later wants “use this model for this turn only,” that should extend the existing `modelOverride` path in runtime orchestration as a separate architecture change.

### Task 1: Lock The Composer Switcher Contract With Tests

**Files:**
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\ai-chat-composer-model-switcher.test.mjs`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\global-ai-settings.test.mjs`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\gn-agent-provider-lock.test.mjs`

- [ ] **Step 1: Add a focused source test for the new composer switcher component**

```js
test('AI chat composer renders a dedicated runtime model switcher trigger and menu', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /AIChatComposerModelSwitcher/);
  assert.match(source, /useAIChatComposerModelSwitcherState/);
  assert.match(source, /chat-model-switcher-trigger/);
  assert.match(source, /chat-model-switcher-menu/);
});
```

- [ ] **Step 2: Assert the switcher supports both config selection and model selection in default chat**

```js
assert.match(source, /handleSelectRuntimeConfig/);
assert.match(source, /handleSelectRuntimeModel/);
assert.match(source, /enabledRuntimeConfigs/);
assert.match(source, /runtimeModelOptions/);
```

- [ ] **Step 3: Update the existing global settings test so it no longer expects static-only composer meta**

```js
test('ai chat keeps context usage meta and adds quick model switching near the composer', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /chat-composer-meta/);
  assert.match(source, /AIChatComposerModelSwitcher/);
  assert.match(source, /selectedRuntimeConfig \? selectedRuntimeConfig\.name/);
});
```

- [ ] **Step 4: Lock provider-embedded constraints**

```js
test('provider-embedded AI chat keeps runtimeConfigIdOverride semantics while exposing model-only switching for the bound config', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /runtimeConfigIdOverride\?: string \| null/);
  assert.match(source, /isRuntimeConfigLocked/);
  assert.match(source, /allowConfigSelection:\s*!isRuntimeConfigLocked/);
});
```

- [ ] **Step 5: Run the focused tests to verify they fail first**

Run: `node --test tests/ai/ai-chat-composer-model-switcher.test.mjs tests/ai/global-ai-settings.test.mjs tests/ai/gn-agent-provider-lock.test.mjs`

Expected: FAIL because the composer switcher files and source wiring do not exist yet.

### Task 2: Extract Shared Composer Switcher State Without Breaking Settings Draft Flow

**Files:**
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\useAIChatComposerModelSwitcherState.ts`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\useAIChatSettingsState.ts`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChat.tsx`

- [ ] **Step 1: Create a dedicated hook input contract for the composer switcher**

```ts
type UseAIChatComposerModelSwitcherStateInput = {
  aiConfigs: AIConfigEntry[];
  selectedConfigId: string | null;
  runtimeConfigIdOverride: string | null;
  selectConfig: (configId: string | null) => void;
  updateConfig: (configId: string, updates: Partial<Omit<AIConfigEntry, 'id'>>) => void;
  findPresetByConfig: (provider: AIProviderType, baseURL: string) => ProviderPreset | null;
  buildProviderKey: (provider: AIProviderType, baseURL: string) => string;
  mergeModelCandidates: (...groups: string[][]) => string[];
};
```

- [ ] **Step 2: Derive enabled configs and lock state inside the new hook**

```ts
const enabledRuntimeConfigs = aiConfigs.filter((item) => item.enabled && hasUsableAIConfigEntry(item));
const activeRuntimeConfig =
  (runtimeConfigIdOverride ? aiConfigs.find((item) => item.id === runtimeConfigIdOverride) : null)
  || enabledRuntimeConfigs.find((item) => item.id === selectedConfigId)
  || enabledRuntimeConfigs[0]
  || null;
const isRuntimeConfigLocked = Boolean(runtimeConfigIdOverride);
```

- [ ] **Step 3: Reuse the provider/model candidate merge strategy instead of duplicating ad-hoc lists**

```ts
const runtimeModelOptions = mergeModelCandidates(
  preset.models,
  modelCatalog[buildProviderKey(activeRuntimeConfig.provider, activeRuntimeConfig.baseURL)] || [],
  [activeRuntimeConfig.model],
);
```

- [ ] **Step 4: Define immediate composer actions that preserve existing runtime truth**

```ts
const handleSelectRuntimeConfig = (configId: string) => {
  if (!isRuntimeConfigLocked) {
    selectConfig(configId);
  }
};

const handleSelectRuntimeModel = (model: string) => {
  if (!activeRuntimeConfig) return;
  updateConfig(activeRuntimeConfig.id, { model });
};
```

- [ ] **Step 5: Keep settings draft/save behavior isolated**

```ts
// Do not route composer switching through settingsDraft or handleApplySettings.
// Settings drawer remains draft-based.
```

- [ ] **Step 6: Run the new and existing hook-boundary tests**

Run: `node --test tests/ai/ai-chat-composer-model-switcher.test.mjs tests/ai/ai-chat-settings-state-hook-boundary.test.mjs`

Expected: PASS after the shared logic is extracted cleanly and settings draft responsibilities remain in `useAIChatSettingsState.ts`.

### Task 3: Build The Quick Switcher UI And Mount It Beside The Composer

**Files:**
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChatComposerModelSwitcher.tsx`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChat.tsx`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\ai\gn-agent\GNAgentEmbeddedPieces.tsx`

- [ ] **Step 1: Create a dedicated switcher component API**

```tsx
type AIChatComposerModelSwitcherProps = {
  activeRuntimeConfig: AIConfigEntry | null;
  enabledRuntimeConfigs: AIConfigEntry[];
  runtimeModelOptions: string[];
  isRuntimeConfigLocked: boolean;
  allowConfigSelection: boolean;
  onSelectConfig: (configId: string) => void;
  onSelectModel: (model: string) => void;
};
```

- [ ] **Step 2: Render a two-panel menu close to the provided reference**

```tsx
<div className="chat-model-switcher-menu" role="menu">
  <div className="chat-model-switcher-configs">
    {enabledRuntimeConfigs.map((config) => (
      <button key={config.id} type="button" onClick={() => onSelectConfig(config.id)}>
        <strong>{config.name}</strong>
        <span>{config.provider}</span>
      </button>
    ))}
  </div>
  <div className="chat-model-switcher-models">
    {runtimeModelOptions.map((model) => (
      <button key={model} type="button" onClick={() => onSelectModel(model)}>
        {model}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Keep the trigger compact and composer-native**

```tsx
<button type="button" className="chat-model-switcher-trigger" aria-label="切换模型">
  <span>{activeRuntimeConfig?.name || '未启用 AI'}</span>
  <strong>{activeRuntimeConfig?.model || '选择模型'}</strong>
</button>
```

- [ ] **Step 4: Mount the switcher in default chat footer**

```tsx
<div className="chat-composer-footer">
  <ChatSandboxPolicySelector ... />
  <AIChatComposerModelSwitcher ... />
  <div className="chat-composer-meta">
    <span>{currentContextUsage.usedLabel} / {currentContextUsage.limitLabel}</span>
  </div>
</div>
```

- [ ] **Step 5: Add a slot to embedded composer so GN Agent pages use the same switcher**

```tsx
export const GNAgentEmbeddedComposer: React.FC<{
  runtimeSwitcher?: React.ReactNode;
  ...
}> = ({ runtimeSwitcher, ...props }) => (
  <div className="chat-composer-embedded-toolbar-start">
    {toolbarStartContent}
    {runtimeSwitcher}
    ...
  </div>
);
```

- [ ] **Step 6: Wire the slot from `AIChat.tsx`**

```tsx
<GNAgentEmbeddedComposer
  runtimeSwitcher={<AIChatComposerModelSwitcher ... />}
  ...
/>
```

- [ ] **Step 7: Run the UI source tests**

Run: `node --test tests/ai/ai-chat-composer-model-switcher.test.mjs tests/ai/agent-chat-runtime-ui.test.mjs tests/ai/global-ai-settings.test.mjs`

Expected: PASS, confirming both default and embedded shells expose the switcher without regressing runtime wiring.

### Task 4: Style Locked, Active, And Overflow States In `AIChat.css`

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChat.css`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\ai-chat-composer-model-switcher.test.mjs`

- [ ] **Step 1: Add switcher trigger styling that fits the current composer shell**

```css
.chat-model-switcher-trigger {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 220px;
}
```

- [ ] **Step 2: Add dropdown layout for config and model columns**

```css
.chat-model-switcher-menu {
  display: grid;
  grid-template-columns: minmax(180px, 220px) minmax(220px, 280px);
}
```

- [ ] **Step 3: Add active, locked, and scroll states**

```css
.chat-model-switcher-config-item.active,
.chat-model-switcher-model-item.active {
  background: var(--panel-selected);
}

.chat-model-switcher-trigger.locked {
  cursor: default;
}
```

- [ ] **Step 4: Keep embedded layout responsive**

```css
.chat-shell-embedded .chat-model-switcher-menu {
  width: min(560px, calc(100vw - 40px));
}
```

- [ ] **Step 5: Run the focused test and build**

Run: `node --test tests/ai/ai-chat-composer-model-switcher.test.mjs`

Expected: PASS

Run: `npm run build`

Expected: exit code 0 with a successful Vite build.

### Task 5: Verify Runtime Submission Semantics And Provider Locks

**Files:**
- Verify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\useAIChatSidecarSessionActions.ts`
- Verify: `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\runtime-sidecar\runtimeSidecarSessionBridge.ts`
- Verify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\gn-agent-provider-lock.test.mjs`
- Verify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\agent-chat-runtime-ui.test.mjs`

- [ ] **Step 1: Confirm submit flow still uses `selectedRuntimeConfig` as the only runtime config source**

```ts
await submitRuntimeSidecarTurn({
  ...
  runtimeConfig: selectedRuntimeConfig,
});
```

- [ ] **Step 2: Confirm no lower-layer protocol changes are introduced for this scope**

```ts
// No changes to canonical event mapping, timeline composer, or assistant render model are needed.
```

- [ ] **Step 3: Run provider/runtime wiring tests**

Run: `node --test tests/ai/gn-agent-provider-lock.test.mjs tests/ai/agent-chat-runtime-ui.test.mjs`

Expected: PASS, confirming Claude/Codex embedded routes still honor `runtimeConfigIdOverride` and the chat submit path still goes through `submitRuntimeSidecarTurn`.

- [ ] **Step 4: Review the final diff**

Run: `git diff -- src/components/workspace/AIChat.tsx src/components/workspace/AIChat.css src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx src/components/workspace/AIChatComposerModelSwitcher.tsx src/components/workspace/useAIChatComposerModelSwitcherState.ts src/components/workspace/useAIChatSettingsState.ts tests/ai/ai-chat-composer-model-switcher.test.mjs tests/ai/global-ai-settings.test.mjs tests/ai/gn-agent-provider-lock.test.mjs`

Expected: only composer-switcher UI/state/test changes appear, with no runtime-truth refactors below the config boundary.

## Self-Review

- Spec coverage:
  - input-area model switching: covered by Tasks 1-4
  - screenshot-like two-panel quick switch: covered by Task 3
  - provider-embedded lock behavior: covered by Tasks 1 and 5
  - preserve runtime/config architecture: covered by Tasks 2 and 5
- Placeholder scan:
  - no `TODO`, `TBD`, or “handle later” placeholders remain
- Type consistency:
  - `activeRuntimeConfig`, `enabledRuntimeConfigs`, `runtimeModelOptions`, `isRuntimeConfigLocked`, `handleSelectRuntimeConfig`, and `handleSelectRuntimeModel` are used consistently across tasks

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-13-chat-composer-model-switch-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
