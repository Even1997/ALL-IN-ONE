# Chat Composer Model Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-model support to AI configs in settings and add a model switcher next to the chat composer so users can maintain multiple models per provider/config and switch the active runtime model from the input area.

**Architecture:** Keep runtime truth at the existing `selectedRuntimeConfig -> submitRuntimeSidecarTurn(runtimeConfig)` boundary. Extend config persistence so each `AIConfigEntry` stores one active `model` plus a persisted list of saved model candidates for that config; the settings UI edits that list, and the composer switcher consumes it for fast runtime changes. Do not push chat-only display policy into provider adapters, canonical runtime events, or timeline/render-model layers.

**Tech Stack:** React 19, TypeScript, Zustand, local CSS, Node `--test` source assertions, Vite build

---

## File Structure

- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChat.tsx`
  Responsibility: wire the composer switcher into the default and embedded chat shells, pass active runtime state into the switcher, and keep submit flow unchanged.
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChat.css`
  Responsibility: style the trigger, dropdown, provider/model columns, compact state labels, and locked/disabled states.
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\ai\gn-agent\GNAgentEmbeddedPieces.tsx`
  Responsibility: expose a dedicated slot for the model switcher in the embedded composer toolbar instead of only rendering static text meta.
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\store\aiConfigState.ts`
  Responsibility: extend persisted AI config data to store a saved model list per config, normalize older persisted state, and keep runtime conversion backward-compatible.
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\store\globalAIStore.ts`
  Responsibility: persist and update multi-model config state, including immediate model selection updates from the composer.
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChatComposerModelSwitcher.tsx`
  Responsibility: render the quick-switch trigger and popover UI, including provider/config list and model list.
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\useAIChatComposerModelSwitcherState.ts`
  Responsibility: derive enabled runtime configs, active model options, lock state, and immediate actions for selecting config/model from composer context.
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\useAIChatSettingsState.ts`
  Responsibility: extract or share model-catalog helpers so settings and composer switcher do not duplicate provider/model option logic, and keep settings draft/save behavior aligned with the new multi-model field.
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChatAISettingsTab.tsx`
  Responsibility: add editable model-list fields in settings, keep one active model, and support add/remove/select operations per config.
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\global-ai-settings.test.mjs`
  Responsibility: replace the old “composer only shows static AI meta” expectation with source assertions for the new quick switcher and cover the new multi-model settings UI.
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\gn-agent-provider-lock.test.mjs`
  Responsibility: lock provider-embedded behavior so bound Claude/Codex stages stay config-scoped.
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\ai-chat-composer-model-switcher.test.mjs`
  Responsibility: source-level contract tests for the new trigger, menu layout, config/model actions, and disabled states.
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\ai-chat-settings-state-hook-boundary.test.mjs`
  Responsibility: confirm settings state keeps save/draft responsibilities while multi-model persistence logic is shared safely.
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\global-ai-settings.test.mjs`
  Responsibility: assert that the settings modal exposes model list fields, add/remove controls, and active-model binding.

## Product Decisions

- Each AI config stores:
  - `model`: the active runtime model used for submission
  - `savedModels: string[]`: the persisted list of user-managed model candidates for that config
- Settings is the place where users curate `savedModels`; composer quick switch is the place where users pick the active `model` from that saved list or preset/fetched candidates.
- Composer quick switch is an **immediate operational action**, not a settings draft. Selecting a config updates `selectedConfigId`; selecting a model updates the active config via `updateConfig`, and should also keep `savedModels` containing that chosen model.
- Default chat supports:
  - switching between enabled configs
  - switching models within the currently highlighted config
- Provider-embedded chat (`runtimeConfigIdOverride`) supports:
  - switching models for the bound config
  - no cross-config switching unless the override owner changes upstream
- In settings, users can:
  - add a blank model row
  - edit each saved model ID directly
  - remove a saved model row unless it is the last remaining valid candidate
  - mark one saved model as the active `model`
- If the active provider has cached/fetched model candidates, merge them with `savedModels`; otherwise fall back to preset models plus the current `config.model`.
- Persisted-state migration should upgrade older configs that only have `model` by seeding `savedModels` with `[model]`.
- This scope does **not** add a per-message ephemeral `modelOverride`. If the product later wants “use this model for this turn only,” that should extend the existing `modelOverride` path in runtime orchestration as a separate architecture change.

### Task 1: Lock Multi-Model Config Persistence And Settings UI Contracts With Tests

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\global-ai-settings.test.mjs`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\ai-chat-settings-state-hook-boundary.test.mjs`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\store\aiConfigState.ts`

- [ ] **Step 1: Add a source-level test for persisted multi-model fields in AI config state**

```js
test('ai config state persists one active model plus saved model candidates per config', async () => {
  const source = await readFile(path.resolve(__dirname, '../../src/modules/ai/store/aiConfigState.ts'), 'utf8');

  assert.match(source, /savedModels:\s*string\[\]/);
  assert.match(source, /savedModels:\s*normalizeSavedModels/);
  assert.match(source, /model:\s*resolveActiveModel/);
});
```

- [ ] **Step 2: Add settings UI assertions for editable model rows**

```js
test('ai settings modal exposes editable saved model rows and an active model selector', async () => {
  const settingsTabSource = await readFile(settingsTabPath, 'utf8');

  assert.match(settingsTabSource, /savedModels/);
  assert.match(settingsTabSource, /handleAddSavedModel/);
  assert.match(settingsTabSource, /handleRemoveSavedModel/);
  assert.match(settingsTabSource, /handleSelectActiveModel/);
});
```

- [ ] **Step 3: Extend the hook-boundary test so multi-model mutations stay inside the settings hook**

```js
assert.match(hookSource, /const handleAddSavedModel = useCallback/);
assert.match(hookSource, /const handleRemoveSavedModel = useCallback/);
assert.match(hookSource, /const handleSelectActiveModel = useCallback/);
```

- [ ] **Step 4: Run the focused tests to verify they fail first**

Run: `node --test tests/ai/global-ai-settings.test.mjs tests/ai/ai-chat-settings-state-hook-boundary.test.mjs`

Expected: FAIL because `savedModels` persistence and settings-row handlers do not exist yet.

### Task 2: Extend `AIConfigEntry` To Persist Multiple Models Per Config

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\store\aiConfigState.ts`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\store\globalAIStore.ts`

- [ ] **Step 1: Add a persisted multi-model field without breaking runtime compatibility**

```ts
export type AIConfigEntry = {
  id: string;
  name: string;
  provider: AIProviderType;
  apiKey: string;
  baseURL: string;
  model: string;
  savedModels: string[];
  contextWindowTokens: number;
  customHeaders: string;
  enabled: boolean;
};
```

- [ ] **Step 2: Normalize older configs by seeding `savedModels` from `model`**

```ts
const normalizeSavedModels = (savedModels: string[] | undefined, model: string) => {
  const normalized = [...new Set((savedModels || []).map((item) => item.trim()).filter(Boolean))];
  return normalized.length > 0 ? normalized : [model].map((item) => item.trim()).filter(Boolean);
};
```

- [ ] **Step 3: Keep the active `model` valid against the normalized list**

```ts
const resolveActiveModel = (model: string, savedModels: string[]) =>
  savedModels.includes(model.trim()) ? model.trim() : savedModels[0] || '';
```

- [ ] **Step 4: Update config creation helpers so presets seed saved model lists**

```ts
savedModels: normalizeSavedModels(overrides.savedModels, overrides.model || 'gpt-4o-mini')
```

- [ ] **Step 5: Update store writes so direct model changes keep `savedModels` in sync**

```ts
const nextSavedModels = normalizeSavedModels(
  'savedModels' in updates ? updates.savedModels : item.savedModels,
  typeof updates.model === 'string' ? updates.model : item.model,
);
```

- [ ] **Step 6: Run config/store tests**

Run: `node --test tests/ai/global-ai-settings.test.mjs`

Expected: PASS for the new persistence assertions and any existing config-store checks.

### Task 3: Add Multi-Model Editing To The Settings Drawer

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\useAIChatSettingsState.ts`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChatAISettingsTab.tsx`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\global-ai-settings.test.mjs`

- [ ] **Step 1: Extend the settings draft shape**

```ts
type AISettingsDraft = {
  id: string | null;
  name: string;
  provider: AIProviderType;
  apiKey: string;
  baseURL: string;
  model: string;
  savedModels: string[];
  contextWindowTokens: number;
  customHeaders: string;
  enabled: boolean;
};
```

- [ ] **Step 2: Add draft handlers for add, edit, remove, and activate**

```ts
const handleAddSavedModel = useCallback(() => {
  setSettingsDraft((current) => ({
    ...current,
    savedModels: [...current.savedModels, ''],
  }));
}, []);
```

- [ ] **Step 3: Keep the active `model` aligned when rows change**

```ts
const handleRemoveSavedModel = useCallback((index: number) => {
  setSettingsDraft((current) => {
    const nextSavedModels = current.savedModels.filter((_, itemIndex) => itemIndex !== index);
    const normalized = normalizeDraftSavedModels(nextSavedModels, current.model);
    return {
      ...current,
      savedModels: normalized,
      model: normalized.includes(current.model) ? current.model : normalized[0] || '',
    };
  });
}, []);
```

- [ ] **Step 4: Render explicit saved-model rows in the settings tab**

```tsx
{settingsDraft.savedModels.map((savedModel, index) => (
  <div key={`${index}-${savedModel}`} className="chat-settings-model-row">
    <input
      value={savedModel}
      onChange={(event) => handleUpdateSavedModel(index, event.target.value)}
      placeholder="输入模型 ID"
    />
    <button type="button" onClick={() => handleSelectActiveModel(savedModel)}>
      设为当前
    </button>
    <button type="button" onClick={() => handleRemoveSavedModel(index)}>
      删除
    </button>
  </div>
))}
```

- [ ] **Step 5: Save `savedModels` together with the existing config fields**

```ts
updateConfig(settingsDraft.id, {
  ...,
  model: settingsDraft.model,
  savedModels: normalizeDraftSavedModels(settingsDraft.savedModels, settingsDraft.model),
});
```

- [ ] **Step 6: Run the settings-specific tests**

Run: `node --test tests/ai/global-ai-settings.test.mjs tests/ai/ai-chat-settings-state-hook-boundary.test.mjs`

Expected: PASS, confirming the settings modal can maintain multiple models per config and still preserve one active runtime model.

### Task 4: Lock The Composer Switcher Contract With Tests

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
assert.match(source, /savedModels/);
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

### Task 5: Extract Shared Composer Switcher State Without Breaking Settings Draft Flow

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
  activeRuntimeConfig.savedModels,
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
  updateConfig(activeRuntimeConfig.id, {
    model,
    savedModels: mergeModelCandidates(activeRuntimeConfig.savedModels, [model]),
  });
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

### Task 6: Build The Quick Switcher UI And Mount It Beside The Composer

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

### Task 7: Style Locked, Active, And Overflow States In `AIChat.css`

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

### Task 8: Verify Runtime Submission Semantics, Migration, And Provider Locks

**Files:**
- Verify: `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\store\aiConfigState.ts`
- Verify: `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\store\globalAIStore.ts`
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

- [ ] **Step 3: Confirm migrated configs remain runnable with a single active runtime model**

```ts
// `toRuntimeAIConfig` still returns only `model`, not `savedModels`.
```

- [ ] **Step 4: Run provider/runtime wiring tests**

Run: `node --test tests/ai/gn-agent-provider-lock.test.mjs tests/ai/agent-chat-runtime-ui.test.mjs`

Expected: PASS, confirming Claude/Codex embedded routes still honor `runtimeConfigIdOverride` and the chat submit path still goes through `submitRuntimeSidecarTurn`.

- [ ] **Step 5: Review the final diff**

Run: `git diff -- src/modules/ai/store/aiConfigState.ts src/modules/ai/store/globalAIStore.ts src/components/workspace/AIChat.tsx src/components/workspace/AIChat.css src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx src/components/workspace/AIChatAISettingsTab.tsx src/components/workspace/AIChatComposerModelSwitcher.tsx src/components/workspace/useAIChatComposerModelSwitcherState.ts src/components/workspace/useAIChatSettingsState.ts tests/ai/ai-chat-composer-model-switcher.test.mjs tests/ai/global-ai-settings.test.mjs tests/ai/gn-agent-provider-lock.test.mjs tests/ai/ai-chat-settings-state-hook-boundary.test.mjs`

Expected: only config persistence, settings multi-model UI, and composer-switcher UI/state/test changes appear, with no runtime-truth refactors below the config boundary.

## Self-Review

- Spec coverage:
  - settings can maintain multiple models per config: covered by Tasks 1-3
  - input-area model switching: covered by Tasks 4-7
  - screenshot-like two-panel quick switch: covered by Task 6
  - provider-embedded lock behavior: covered by Tasks 4 and 8
  - preserve runtime/config architecture: covered by Tasks 2, 5, and 8
- Placeholder scan:
  - no `TODO`, `TBD`, or “handle later” placeholders remain
- Type consistency:
  - `savedModels`, `activeRuntimeConfig`, `enabledRuntimeConfigs`, `runtimeModelOptions`, `isRuntimeConfigLocked`, `handleSelectRuntimeConfig`, and `handleSelectRuntimeModel` are used consistently across tasks

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-13-chat-composer-model-switch-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
