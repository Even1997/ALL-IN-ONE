# Claudian SDK Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current faux Claudian AI page with a real Claudian-derived shell that exposes `Claudian`, `Claude`, and `Codex` entry icons, while preserving the existing `AIChat` as a compatibility view.

**Architecture:** Build a new `ClaudianShell` layer modeled after Claudian's real shell structure, then route Claude and Codex through explicit provider/runtime registration. Keep the current app navigation intact and migrate incrementally so each phase is shippable.

**Tech Stack:** React, TypeScript, Zustand, existing AI store modules, Claudian source architecture as reference

---

### Task 1: Introduce Claudian shell view state

**Files:**
- Create: `src/modules/ai/claudian/claudianShellStore.ts`
- Create: `src/modules/ai/claudian/types.ts`
- Test: `tests/ai/claudian-shell-state.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shellStorePath = path.resolve(__dirname, '../../src/modules/ai/claudian/claudianShellStore.ts');

test('claudian shell store exposes mode selection for classic, config, claude, and codex', async () => {
  const source = await readFile(shellStorePath, 'utf8');
  assert.match(source, /'classic'/);
  assert.match(source, /'config'/);
  assert.match(source, /'claude'/);
  assert.match(source, /'codex'/);
  assert.match(source, /setMode/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/claudian-shell-state.test.mjs`
Expected: FAIL because `src/modules/ai/claudian/claudianShellStore.ts` does not exist yet

- [ ] **Step 3: Write minimal implementation**

```ts
import { create } from 'zustand';

export type ClaudianShellMode = 'classic' | 'config' | 'claude' | 'codex';

type ClaudianShellState = {
  mode: ClaudianShellMode;
  setMode: (mode: ClaudianShellMode) => void;
};

export const useClaudianShellStore = create<ClaudianShellState>((set) => ({
  mode: 'classic',
  setMode: (mode) => set({ mode }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/claudian-shell-state.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/claudian-shell-state.test.mjs src/modules/ai/claudian/types.ts src/modules/ai/claudian/claudianShellStore.ts
git commit -m "feat: add claudian shell state"
```

### Task 2: Add Claudian shell components and icon switch entry

**Files:**
- Create: `src/components/ai/claudian-shell/ClaudianShell.tsx`
- Create: `src/components/ai/claudian-shell/ClaudianModeSwitch.tsx`
- Create: `src/components/ai/claudian-shell/ClaudianConfigPage.tsx`
- Create: `src/components/ai/claudian-shell/ClaudianChatPage.tsx`
- Create: `src/components/ai/claudian-shell/ClaudianShell.css`
- Modify: `src/components/ai/ClaudePage.tsx`
- Modify: `src/components/ai/ClaudePage.css`
- Test: `tests/ai/claudian-shell-components.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shellPath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianShell.tsx');
const pagePath = path.resolve(__dirname, '../../src/components/ai/ClaudePage.tsx');

test('claudian shell exposes classic/config/claude/codex routes and mode switch', async () => {
  const shellSource = await readFile(shellPath, 'utf8');
  assert.match(shellSource, /ClaudianModeSwitch/);
  assert.match(shellSource, /mode === 'config'/);
  assert.match(shellSource, /mode === 'claude'/);
  assert.match(shellSource, /mode === 'codex'/);
});

test('claude page mounts the new claudian shell', async () => {
  const pageSource = await readFile(pagePath, 'utf8');
  assert.match(pageSource, /ClaudianShell/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/claudian-shell-components.test.mjs`
Expected: FAIL because the new shell components do not exist yet

- [ ] **Step 3: Write minimal implementation**

```tsx
import React from 'react';
import { useClaudianShellStore } from '../../modules/ai/claudian/claudianShellStore';
import { ClaudianModeSwitch } from './ClaudianModeSwitch';
import { ClaudianConfigPage } from './ClaudianConfigPage';
import { ClaudianChatPage } from './ClaudianChatPage';

export const ClaudianShell: React.FC = () => {
  const { mode } = useClaudianShellStore();

  return (
    <section className="claudian-shell">
      <ClaudianModeSwitch />
      {mode === 'config' ? <ClaudianConfigPage /> : null}
      {mode === 'claude' ? <ClaudianChatPage providerId="claude" /> : null}
      {mode === 'codex' ? <ClaudianChatPage providerId="codex" /> : null}
      {mode === 'classic' ? <ClaudianChatPage providerId="classic" /> : null}
    </section>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/claudian-shell-components.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/claudian-shell-components.test.mjs src/components/ai/claudian-shell src/components/ai/ClaudePage.tsx src/components/ai/ClaudePage.css
git commit -m "feat: add claudian shell host components"
```

### Task 3: Move the entry icons into the composer action area

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/AIChat.css`
- Create: `tests/ai/claudian-mode-switch-placement.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('ai chat renders a claudian entry area above the composer action strip', async () => {
  const source = await readFile(aiChatPath, 'utf8');
  assert.match(source, /ClaudianModeSwitch/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/claudian-mode-switch-placement.test.mjs`
Expected: FAIL because `AIChat.tsx` does not render the new switch

- [ ] **Step 3: Write minimal implementation**

```tsx
import { ClaudianModeSwitch } from '../ai/claudian-shell/ClaudianModeSwitch';

// inside the composer region
<div className="chat-composer-claudian-entry">
  <ClaudianModeSwitch compact />
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/claudian-mode-switch-placement.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/claudian-mode-switch-placement.test.mjs src/components/workspace/AIChat.tsx src/components/workspace/AIChat.css
git commit -m "feat: place claudian entry switch above composer actions"
```

### Task 4: Add provider registration modeled on Claudian

**Files:**
- Create: `src/modules/ai/claudian/providers/types.ts`
- Create: `src/modules/ai/claudian/providers/index.ts`
- Create: `src/modules/ai/claudian/providers/claudeRegistration.ts`
- Create: `src/modules/ai/claudian/providers/codexRegistration.ts`
- Test: `tests/ai/claudian-provider-registry.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '../../src/modules/ai/claudian/providers/index.ts');

test('provider registry registers claude and codex', async () => {
  const source = await readFile(indexPath, 'utf8');
  assert.match(source, /claude/);
  assert.match(source, /codex/);
  assert.match(source, /registerBuiltInProviders/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/claudian-provider-registry.test.mjs`
Expected: FAIL because the provider registry does not exist yet

- [ ] **Step 3: Write minimal implementation**

```ts
import { claudeProviderRegistration } from './claudeRegistration';
import { codexProviderRegistration } from './codexRegistration';

export const CLAUDIAN_PROVIDER_REGISTRY = {
  claude: claudeProviderRegistration,
  codex: codexProviderRegistration,
};

export const registerBuiltInProviders = () => CLAUDIAN_PROVIDER_REGISTRY;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/claudian-provider-registry.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/claudian-provider-registry.test.mjs src/modules/ai/claudian/providers
git commit -m "feat: add claudian-style provider registry"
```

### Task 5: Scaffold Claude and Codex runtimes

**Files:**
- Create: `src/modules/ai/claudian/runtime/claude/ClaudeRuntime.ts`
- Create: `src/modules/ai/claudian/runtime/codex/CodexRuntime.ts`
- Create: `src/modules/ai/claudian/runtime/types.ts`
- Test: `tests/ai/claudian-runtime-scaffold.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const claudeRuntimePath = path.resolve(__dirname, '../../src/modules/ai/claudian/runtime/claude/ClaudeRuntime.ts');
const codexRuntimePath = path.resolve(__dirname, '../../src/modules/ai/claudian/runtime/codex/CodexRuntime.ts');

test('claude runtime exists as a dedicated sdk-backed runtime layer', async () => {
  const source = await readFile(claudeRuntimePath, 'utf8');
  assert.match(source, /class ClaudeRuntime/);
});

test('codex runtime exists as a dedicated runtime layer', async () => {
  const source = await readFile(codexRuntimePath, 'utf8');
  assert.match(source, /class CodexRuntime/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/claudian-runtime-scaffold.test.mjs`
Expected: FAIL because the runtime files do not exist yet

- [ ] **Step 3: Write minimal implementation**

```ts
export class ClaudeRuntime {
  readonly providerId = 'claude';
}
```

```ts
export class CodexRuntime {
  readonly providerId = 'codex';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/claudian-runtime-scaffold.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/claudian-runtime-scaffold.test.mjs src/modules/ai/claudian/runtime
git commit -m "feat: scaffold claudian runtimes"
```

### Task 6: Rehost current AI page and compact workspace on the new shell

**Files:**
- Modify: `src/components/ai/ClaudianWorkspace.tsx`
- Modify: `src/components/ai/AIWorkspace.tsx`
- Modify: `src/components/ai/AIWorkspace.css`
- Modify: `tests/ai/ai-workspace.test.mjs`
- Modify: `tests/ai/claude-page.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspacePath = path.resolve(__dirname, '../../src/components/ai/ClaudianWorkspace.tsx');

test('claudian workspace becomes a host for the new claudian shell', async () => {
  const source = await readFile(workspacePath, 'utf8');
  assert.match(source, /ClaudianShell/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/ai-workspace.test.mjs tests/ai/claude-page.test.mjs`
Expected: FAIL until the old fake workspace host is replaced

- [ ] **Step 3: Write minimal implementation**

```tsx
import { ClaudianShell } from './claudian-shell/ClaudianShell';

export const ClaudianWorkspace: React.FC<{ mode?: 'panel' | 'full-page' }> = ({ mode = 'panel' }) => (
  <section className={`claudian-workspace claudian-workspace-${mode}`}>
    <ClaudianShell />
  </section>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/ai-workspace.test.mjs tests/ai/claude-page.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ai/ClaudianWorkspace.tsx src/components/ai/AIWorkspace.tsx src/components/ai/AIWorkspace.css tests/ai/ai-workspace.test.mjs tests/ai/claude-page.test.mjs
git commit -m "refactor: mount new claudian shell in ai workspace"
```

### Task 7: Verify migrated shell baseline

**Files:**
- No code changes required unless verification fails

- [ ] **Step 1: Run focused AI tests**

Run: `node --test tests/ai/ai-workspace.test.mjs tests/ai/claude-page.test.mjs tests/ai/claudian-shell-state.test.mjs tests/ai/claudian-shell-components.test.mjs tests/ai/claudian-mode-switch-placement.test.mjs tests/ai/claudian-provider-registry.test.mjs tests/ai/claudian-runtime-scaffold.test.mjs`
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Record remaining gaps before Claude/Codex runtime parity**

```md
- Claude runtime is scaffolded, not fully SDK-wired yet
- Codex runtime is scaffolded, not fully process/app-server-wired yet
- Claudian CSS parity is partial until module-by-module style migration completes
```

- [ ] **Step 4: Commit verification-safe baseline**

```bash
git add .
git commit -m "chore: establish claudian shell migration baseline"
```
