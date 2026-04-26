# Dyad Global UI And Right AI Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dedicated AI page, keep AI as the unified right-side workbench surface, and strip placeholder provider chrome so the app follows one global dyad-style UI system.

**Architecture:** The implementation keeps the existing desktop workbench shell and the existing `AIChat` runtime logic, but removes the separate `ClaudePage` routing branch and collapses `ClaudianShell` back into a compact right-pane host. Provider-specific runtime selection remains available, but fake session cards, hero copy, and full-page-only branches are deleted so the UI only exposes actionable chat, context, and settings controls.

**Tech Stack:** React 19, TypeScript, Zustand, Allotment, Node `--test` source-level tests, Vite build

---

### Task 1: Remove The Top-Level AI Route And Keep AI In The Right Pane

**Files:**
- Modify: `src/appNavigation.ts`
- Modify: `src/App.tsx`
- Modify: `tests/app-navigation.test.mjs`
- Modify: `tests/ai/claude-page.test.mjs`

- [ ] **Step 1: Write the failing navigation and routing tests**

Replace the assertions in `tests/app-navigation.test.mjs` and `tests/ai/claude-page.test.mjs` so they describe the new behavior first:

```js
// tests/app-navigation.test.mjs
test('visible role tabs keep ai out of top navigation', () => {
  assert.deepEqual(
    VISIBLE_ROLE_TABS.map((tab) => tab.id),
    ['product', 'design']
  );
  assert.equal(VISIBLE_ROLE_TABS.find((tab) => tab.id === 'product')?.label, '产品');
  assert.equal(VISIBLE_ROLE_TABS.find((tab) => tab.id === 'design')?.label, '设计');
});
```

```js
// tests/ai/claude-page.test.mjs
test('app keeps ai in the right pane instead of routing to a dedicated ai page', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.doesNotMatch(source, /import\s+\{\s*ClaudePage\s*\}/);
  assert.doesNotMatch(source, /currentRole === 'ai'/);
  assert.doesNotMatch(source, /const isAIPage = currentRole === 'ai'/);
  assert.match(source, /const appMainContent = isProjectManagerOpen \?/);
  assert.match(source, /<aside className="app-ai-activity-pane">/);
  assert.match(source, /<AIWorkspace \/>/);
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```powershell
node --test tests/app-navigation.test.mjs tests/ai/claude-page.test.mjs
```

Expected:

- `tests/app-navigation.test.mjs` fails because `VISIBLE_ROLE_TABS` still includes `ai`
- `tests/ai/claude-page.test.mjs` fails because `App.tsx` still imports `ClaudePage` and checks `currentRole === 'ai'`

- [ ] **Step 3: Make the minimal routing and layout changes**

Update `src/appNavigation.ts` to remove the top-level `ai` role:

```ts
export type RoleView = 'product' | 'design' | 'develop' | 'test' | 'operations';

export type RoleTab = {
  id: RoleView;
  label: string;
};

export const VISIBLE_ROLE_TABS: RoleTab[] = [
  { id: 'product', label: '产品' },
  { id: 'design', label: '设计' },
];
```

Update the relevant `src/App.tsx` sections so the app no longer imports or renders the dedicated AI page:

```tsx
import { AIWorkspace } from './components/ai/AIWorkspace';
// remove: import { ClaudePage } from './components/ai/ClaudePage';
```

```tsx
const roleContent =
  currentRole === 'product'
    ? renderProductView()
    : currentRole === 'design'
      ? renderDesignView()
      : currentRole === 'develop'
        ? renderDevelopView()
        : currentRole === 'test'
          ? renderTestView()
          : renderOperationsView();
```

```tsx
<Allotment className="app-workbench-allotment" onChange={handleDesktopWorkbenchLayoutChange}>
  <Allotment.Pane minSize={640}>
    <div className="app-workbench-pane">
      <main className="app-main app-main-desktop">{appDesktopContent}</main>
    </div>
  </Allotment.Pane>
  <Allotment.Pane
    minSize={DESKTOP_AI_PANE_WIDTH_BOUNDS.min}
    maxSize={DESKTOP_AI_PANE_WIDTH_BOUNDS.max}
    preferredSize={desktopAiPaneWidth}
  >
    <div className="app-workbench-pane">
      <aside className="app-ai-activity-pane">
        <AIWorkspace />
      </aside>
    </div>
  </Allotment.Pane>
</Allotment>
```

```tsx
<>
  <main className="app-main app-main-desktop">{appMainContent}</main>
  <AIWorkspace />
</>
```

- [ ] **Step 4: Run the focused tests again**

Run:

```powershell
node --test tests/app-navigation.test.mjs tests/ai/claude-page.test.mjs
```

Expected:

- both test files pass
- no assertion references remain for `currentRole === 'ai'`

- [ ] **Step 5: Commit only the routing-related files**

Run:

```powershell
git add -- src/appNavigation.ts src/App.tsx tests/app-navigation.test.mjs tests/ai/claude-page.test.mjs
git commit -m "refactor: keep ai in the global right pane"
```

---

### Task 2: Collapse ClaudianShell Into A Compact Right-Pane Host

**Files:**
- Modify: `src/components/ai/claudian-shell/ClaudianShell.tsx`
- Modify: `src/components/ai/claudian-shell/ClaudianShell.css`
- Modify: `tests/ai/claudian-shell-components.test.mjs`
- Modify: `tests/ai/dyad-style-ai-shell.test.mjs`

- [ ] **Step 1: Write failing shell tests for the compact host**

Update `tests/ai/claudian-shell-components.test.mjs` so it asserts the shell keeps runtime switching but drops launcher chrome:

```js
test('claudian shell stays embedded in the right pane without launcher chrome', async () => {
  const shellSource = await readFile(shellPath, 'utf8');

  assert.match(shellSource, /ClaudianModeSwitch/);
  assert.match(shellSource, /ClaudianTabBadges/);
  assert.match(shellSource, /className="claudian-header"/);
  assert.match(shellSource, /className="claudian-tab-content-container"/);
  assert.doesNotMatch(shellSource, /claudian-launcher-hero/);
  assert.doesNotMatch(shellSource, /claudian-header-runtime-strip/);
  assert.doesNotMatch(shellSource, /GoodNight AI/);
});
```

Update `tests/ai/dyad-style-ai-shell.test.mjs` so it expects a single-pane shell surface instead of the old split launcher grid:

```js
test('ai shell css defines a compact shared panel surface for the right pane', async () => {
  const source = await readFile(shellCssPath, 'utf8');

  assert.match(source, /--claudian-bg/);
  assert.match(source, /\.claudian-shell\s*{[\s\S]*?display:\s*flex/);
  assert.match(source, /\.claudian-shell\s*{[\s\S]*?flex-direction:\s*column/);
  assert.doesNotMatch(source, /\.claudian-launcher-hero\s*{/);
});
```

- [ ] **Step 2: Run the focused shell tests to verify they fail**

Run:

```powershell
node --test tests/ai/claudian-shell-components.test.mjs tests/ai/dyad-style-ai-shell.test.mjs
```

Expected:

- the component test fails because `ClaudianShell.tsx` still renders `claudian-launcher-hero` and `claudian-header-runtime-strip`
- the CSS test fails because the shell still uses the old two-column launcher layout

- [ ] **Step 3: Replace the shell with a compact embedded host**

Keep the local runtime snapshot loading logic, but replace the rendered structure in `src/components/ai/claudian-shell/ClaudianShell.tsx` with a compact header plus content body:

```tsx
const pageTitle = useMemo(() => {
  if (currentMode === 'config') {
    return '设置';
  }

  if (currentMode === 'claude') {
    return 'Claude';
  }

  if (currentMode === 'codex') {
    return 'Codex';
  }

  return 'Classic';
}, [currentMode]);

return (
  <section className={`claudian-shell claudian-shell-${mode}`} data-mode={currentMode}>
    <header className="claudian-header">
      <div className="claudian-title-slot">
        <span className="claudian-context-badge">AI</span>
        <h4 className="claudian-title-text">{pageTitle}</h4>
      </div>
      <div className="claudian-header-actions">
        <ClaudianModeSwitch compact />
        <div className="claudian-tab-bar-container">
          <ClaudianTabBadges />
        </div>
      </div>
    </header>

    <div className="claudian-tab-content-container">
      {currentMode === 'config' ? <ClaudianConfigPage /> : null}
      {currentMode === 'claude' ? <ClaudeWorkspace mode={mode} localSnapshot={localSnapshot} /> : null}
      {currentMode === 'codex' ? <CodexWorkspace mode={mode} localSnapshot={localSnapshot} /> : null}
      {currentMode === 'classic' ? <ClassicWorkspace mode={mode} /> : null}
    </div>
  </section>
);
```

Replace the outer shell rules in `src/components/ai/claudian-shell/ClaudianShell.css` with a shared right-pane container:

```css
.claudian-shell {
  --claudian-bg: var(--mode-panel-alt, #111827);
  --claudian-surface: var(--mode-panel, #0f172a);
  --claudian-surface-alt: var(--mode-chip, rgba(255, 255, 255, 0.04));
  --claudian-border: var(--mode-border, rgba(148, 163, 184, 0.18));
  --claudian-border-strong: var(--mode-text, #f8fafc);
  --claudian-text: var(--mode-text, #f8fafc);
  --claudian-muted: var(--mode-muted, rgba(255, 255, 255, 0.62));
  --claudian-accent: var(--mode-accent, #60a5fa);
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  gap: 0;
  padding: 0;
  background: var(--claudian-bg);
  border: 1px solid var(--claudian-border);
  border-radius: var(--style-radius-md, 18px);
  overflow: hidden;
}
```

Delete the obsolete `.claudian-shell-aurora*`, `.claudian-launcher-*`, and `.claudian-header-runtime-strip` blocks from the same stylesheet.

- [ ] **Step 4: Run the focused shell tests again**

Run:

```powershell
node --test tests/ai/claudian-shell-components.test.mjs tests/ai/dyad-style-ai-shell.test.mjs
```

Expected:

- both tests pass
- `ClaudianShell.tsx` still loads `localSnapshot`
- no launcher-hero or runtime-strip classes remain in markup or CSS

- [ ] **Step 5: Commit only the shell compaction files**

Run:

```powershell
git add -- src/components/ai/claudian-shell/ClaudianShell.tsx src/components/ai/claudian-shell/ClaudianShell.css tests/ai/claudian-shell-components.test.mjs tests/ai/dyad-style-ai-shell.test.mjs
git commit -m "refactor: collapse claudian shell into right-pane host"
```

---

### Task 3: Remove Demo Provider Chrome And Keep Only Actionable AI Chat Surfaces

**Files:**
- Modify: `src/components/ai/claudian-shell/ClaudianChatPage.tsx`
- Modify: `src/components/ai/workspaces/ClaudeWorkspace.tsx`
- Modify: `src/components/ai/workspaces/CodexWorkspace.tsx`
- Modify: `src/components/ai/workspaces/ClassicWorkspace.tsx`
- Modify: `src/components/ai/provider-chat/providerChat.css`
- Modify: `tests/ai/provider-workspaces.test.mjs`

- [ ] **Step 1: Write failing provider workspace tests**

Replace `tests/ai/provider-workspaces.test.mjs` with assertions against the actual workspace files instead of the old shell-only smoke test:

```js
const claudeWorkspacePath = path.resolve(__dirname, '../../src/components/ai/workspaces/ClaudeWorkspace.tsx');
const codexWorkspacePath = path.resolve(__dirname, '../../src/components/ai/workspaces/CodexWorkspace.tsx');
const classicWorkspacePath = path.resolve(__dirname, '../../src/components/ai/workspaces/ClassicWorkspace.tsx');
const chatPagePath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianChatPage.tsx');

test('provider workspaces drop demo cards and render direct chat surfaces', async () => {
  const claudeSource = await readFile(claudeWorkspacePath, 'utf8');
  const codexSource = await readFile(codexWorkspacePath, 'utf8');
  const classicSource = await readFile(classicWorkspacePath, 'utf8');
  const chatPageSource = await readFile(chatPagePath, 'utf8');

  assert.doesNotMatch(claudeSource, /provider-demo-session-card/);
  assert.doesNotMatch(codexSource, /provider-demo-session-card/);
  assert.doesNotMatch(chatPageSource, /ClaudianStatusPanel/);
  assert.doesNotMatch(chatPageSource, /ClaudianRuntimeSummary/);
  assert.doesNotMatch(chatPageSource, /ClaudianRuntimeBinding/);
  assert.match(claudeSource, /<ClaudianChatPage providerId="claude"/);
  assert.match(codexSource, /<ClaudianChatPage providerId="codex"/);
  assert.match(classicSource, /<ClaudianChatPage providerId="classic"/);
});
```

- [ ] **Step 2: Run the focused provider tests to verify they fail**

Run:

```powershell
node --test tests/ai/provider-workspaces.test.mjs
```

Expected:

- the test fails because `ClaudeWorkspace.tsx` and `CodexWorkspace.tsx` still render `provider-demo-session-card`
- the test fails because `ClaudianChatPage.tsx` still renders summary/binding/status panels and page headers

- [ ] **Step 3: Replace the demo wrappers with direct chat pages**

Simplify `src/components/ai/claudian-shell/ClaudianChatPage.tsx` to only compute runtime overrides and render the chat surface:

```tsx
export const ClaudianChatPage: React.FC<{
  providerId: 'classic' | 'claude' | 'codex';
  mode?: 'panel' | 'full-page';
  localSnapshot?: LocalAgentConfigSnapshot | null;
}> = ({ providerId, mode = 'panel', localSnapshot = null }) => {
  const runtimeConfigIdOverride = useClaudianShellStore((state) =>
    providerId === 'claude' ? state.claudeConfigId : providerId === 'codex' ? state.codexConfigId : null
  );

  return (
    <section className={`claudian-shell-chat-body claudian-shell-chat-body-${providerId}`} data-provider={providerId}>
      <AIChat
        variant={providerId === 'classic' ? 'default' : 'claudian-embedded'}
        runtimeConfigIdOverride={runtimeConfigIdOverride}
        providerExecutionMode={providerId === 'classic' ? null : providerId}
      />
    </section>
  );
};
```

Replace the provider workspace components with thin wrappers:

```tsx
// src/components/ai/workspaces/ClaudeWorkspace.tsx
export const ClaudeWorkspace: React.FC<{
  mode?: 'panel' | 'full-page';
  localSnapshot?: LocalAgentConfigSnapshot | null;
}> = ({ mode = 'panel', localSnapshot = null }) => (
  <section className={`provider-workspace provider-workspace-claude provider-workspace-${mode}`}>
    <ClaudianChatPage providerId="claude" mode={mode} localSnapshot={localSnapshot} />
  </section>
);
```

```tsx
// src/components/ai/workspaces/CodexWorkspace.tsx
export const CodexWorkspace: React.FC<{
  mode?: 'panel' | 'full-page';
  localSnapshot?: LocalAgentConfigSnapshot | null;
}> = ({ mode = 'panel', localSnapshot = null }) => (
  <section className={`provider-workspace provider-workspace-codex provider-workspace-${mode}`}>
    <ClaudianChatPage providerId="codex" mode={mode} localSnapshot={localSnapshot} />
  </section>
);
```

```tsx
// src/components/ai/workspaces/ClassicWorkspace.tsx
export const ClassicWorkspace: React.FC<{
  mode?: 'panel' | 'full-page';
}> = ({ mode = 'panel' }) => (
  <section className={`provider-workspace provider-workspace-classic provider-workspace-${mode}`}>
    <ClaudianChatPage providerId="classic" mode={mode} />
  </section>
);
```

Delete the obsolete `.provider-demo-session-card` rules from `src/components/ai/provider-chat/providerChat.css`.

- [ ] **Step 4: Run the focused provider tests again**

Run:

```powershell
node --test tests/ai/provider-workspaces.test.mjs
```

Expected:

- the provider workspace test passes
- no demo session card markup remains in the workspace components
- `ClaudianChatPage.tsx` only renders the actionable chat surface

- [ ] **Step 5: Commit only the provider surface cleanup files**

Run:

```powershell
git add -- src/components/ai/claudian-shell/ClaudianChatPage.tsx src/components/ai/workspaces/ClaudeWorkspace.tsx src/components/ai/workspaces/CodexWorkspace.tsx src/components/ai/workspaces/ClassicWorkspace.tsx src/components/ai/provider-chat/providerChat.css tests/ai/provider-workspaces.test.mjs
git commit -m "refactor: remove demo chrome from provider workspaces"
```

---

### Task 4: Delete The Dead Full-Page Branch And Finish The Right-Pane Regression Pass

**Files:**
- Delete: `src/components/ai/ClaudePage.tsx`
- Delete: `src/components/ai/ClaudePage.css`
- Modify: `src/components/ai/ClaudianWorkspace.tsx`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/AIChat.css`
- Modify: `tests/ai/ai-workspace.test.mjs`
- Modify: `tests/ai/claude-page.test.mjs`

- [ ] **Step 1: Write failing tests for the dead full-page branch removal**

Update `tests/ai/ai-workspace.test.mjs` so it expects a panel-only Claudian workspace:

```js
test('claudian workspace is panel-only inside the right pane', async () => {
  const source = await readFile(claudianWorkspacePath, 'utf8');

  assert.doesNotMatch(source, /'panel' \| 'full-page'/);
  assert.doesNotMatch(source, /mode=\{mode\}/);
  assert.match(source, /<ClaudianShell mode="panel" \/>/);
});
```

Update `tests/ai/claude-page.test.mjs` so it asserts the dedicated page files are gone from the source tree and the AI chat variant no longer exposes full-page mode:

```js
test('ai chat no longer exposes a dedicated claude full-page variant', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.doesNotMatch(source, /'claudian-full-page'/);
  assert.match(source, /variant\?: 'default' \| 'claudian-embedded'/);
});
```

- [ ] **Step 2: Run the focused branch-removal tests to verify they fail**

Run:

```powershell
node --test tests/ai/ai-workspace.test.mjs tests/ai/claude-page.test.mjs
```

Expected:

- `tests/ai/ai-workspace.test.mjs` fails because `ClaudianWorkspace.tsx` still forwards a variable `mode`
- `tests/ai/claude-page.test.mjs` fails because `AIChat.tsx` still exposes `claudian-full-page`

- [ ] **Step 3: Remove the dead full-page source path**

Make `src/components/ai/ClaudianWorkspace.tsx` a panel-only wrapper:

```tsx
import React from 'react';
import { ClaudianShell } from './claudian-shell/ClaudianShell';

export const ClaudianWorkspace: React.FC = () => (
  <section className="claudian-workspace claudian-workspace-panel">
    <ClaudianShell mode="panel" />
  </section>
);
```

Update the `AIChatProps` union in `src/components/workspace/AIChat.tsx` and remove the unused `isClaudianFullPage` branch:

```tsx
type AIChatProps = {
  variant?: 'default' | 'claudian-embedded';
  runtimeConfigIdOverride?: string | null;
  providerExecutionMode?: 'claude' | 'codex' | null;
};

const isClaudianEmbedded = variant === 'claudian-embedded';
```

Delete the `.chat-shell.chat-shell-full-page` block from `src/components/workspace/AIChat.css`.

Delete the no-longer-used page files:

```powershell
Remove-Item 'src/components/ai/ClaudePage.tsx'
Remove-Item 'src/components/ai/ClaudePage.css'
```

- [ ] **Step 4: Run the full targeted regression pass and build**

Run:

```powershell
node --test tests/app-navigation.test.mjs tests/ai/claude-page.test.mjs tests/ai/claudian-shell-components.test.mjs tests/ai/provider-workspaces.test.mjs tests/ai/ai-workspace.test.mjs tests/ai/dyad-style-ai-shell.test.mjs
npm run build
```

Expected:

- all listed tests pass
- `npm run build` completes successfully
- no import errors remain for `ClaudePage`

- [ ] **Step 5: Commit only the dead-branch cleanup files**

Run:

```powershell
git add -- src/components/ai/ClaudianWorkspace.tsx src/components/workspace/AIChat.tsx src/components/workspace/AIChat.css tests/ai/ai-workspace.test.mjs tests/ai/claude-page.test.mjs
git add --all src/components/ai/ClaudePage.tsx src/components/ai/ClaudePage.css
git commit -m "refactor: remove dedicated claude page branch"
```

---

### Spec Coverage Check

- Top-level `AI` entry removal is covered by **Task 1**
- Keeping AI in the global right pane is covered by **Task 1**
- Removing `ClaudePage` as a dedicated page is covered by **Task 4**
- Collapsing `ClaudianShell` back into a compact right-pane host is covered by **Task 2**
- Removing hero copy, runtime strips, demo cards, and placeholder provider chrome is covered by **Task 2** and **Task 3**
- Keeping actionable chat, context, runtime selection, and settings controls is covered by **Task 3**
- Removing the dead full-page-only AI branch is covered by **Task 4**
- Final regression and build verification are covered by **Task 4**

### Placeholder Scan

- No `TODO`, `TBD`, or “implement later” placeholders remain
- Every task names exact files
- Every test step includes exact commands
- Every implementation step includes concrete replacement snippets

### Type Consistency Check

- `RoleView` no longer includes `'ai'`
- `ClaudianWorkspace` becomes panel-only in Task 4
- `AIChatProps.variant` becomes `'default' | 'claudian-embedded'` in Task 4
- `ClaudianChatPage` remains the single provider-specific adapter used by `ClaudeWorkspace`, `CodexWorkspace`, and `ClassicWorkspace`

Plan complete and saved to `docs/superpowers/plans/2026-04-26-dyad-global-ui-and-right-ai-unification-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
