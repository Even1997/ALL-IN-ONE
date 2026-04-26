# Dedicated Claude Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the existing GoodNight workbench pages and add a dedicated Claude-style AI page instead of forcing the current AI panel to impersonate a full-page app.

**Architecture:** Keep the existing right-side `AIWorkspace` as the workbench assistant surface for product/design flows, but introduce a separate top-level `ai` role/view that renders a dedicated Claude page in the main content area. The dedicated Claude page should own its own layout and styling, while the existing `AIChat` logic remains the runtime/state backend until a later rewrite.

**Tech Stack:** React, TypeScript, Zustand, Tauri, existing `AIChat` / `AIWorkspace` modules, existing app role navigation in `src/App.tsx` and `src/appNavigation.ts`.

---

## File Structure

**Existing files to modify**
- `src/appNavigation.ts`
  Adds a visible `ai` role tab so Claude gets a first-class page entry instead of living inside the desktop split pane.
- `src/App.tsx`
  Controls the top-level role routing and desktop split layout; must render a dedicated AI main page without deleting product/design/develop/test/operations views.
- `src/App.css`
  Owns app-level layout rules for the workbench row and main pane; must only contain layout helpers for the new full-page AI route, not AI visual theming.
- `src/components/ai/AIWorkspace.tsx`
  Remains the side-panel assistant surface for workbench mode. It should not be treated as the full Claude page.
- `src/components/ai/ClaudianWorkspace.tsx`
  Should become the dedicated Claude page shell entry point, or be split into a full-page shell plus side-panel shell.
- `src/components/ai/AIWorkspace.css`
  Needs separation between side-panel-only layout rules and full-page Claude layout rules.
- `src/components/workspace/AIChat.tsx`
  Continues to provide runtime state and submit logic, but should receive explicit props for `panel` vs `full-page` layout instead of accumulating implicit mixed modes.
- `src/components/workspace/AIChat.css`
  Needs explicit style variants for panel mode vs Claude full-page mode.

**New files to create**
- `src/components/ai/ClaudePage.tsx`
  Dedicated main-area Claude page container. This is the new route target for the `ai` role.
- `src/components/ai/ClaudePage.css`
  Full-page Claude layout and visual system. No workbench split-pane assumptions.
- `src/components/ai/claudian/ClaudePageHeader.tsx`
  Dedicated full-page header controls for the Claude page.
- `src/components/ai/claudian/ClaudePageContext.tsx`
  Dedicated current-context strip for the full-page Claude route.

**Tests to modify/create**
- `tests/ai/ai-workspace.test.mjs`
  Keep this focused on side-panel `AIWorkspace`.
- `tests/ai/claude-page.test.mjs`
  Add coverage that the app has a dedicated Claude page component path and that the route does not replace the whole workbench unexpectedly.

---

### Task 1: Re-introduce a dedicated AI role in app navigation

**Files:**
- Modify: `src/appNavigation.ts`
- Modify: `src/App.tsx`
- Test: `tests/ai/claude-page.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('app navigation exposes a dedicated ai role tab', async () => {
  const source = await readFile('src/appNavigation.ts', 'utf8');
  assert.match(source, /'ai'/);
  assert.match(source, /label:\s*'AI'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/claude-page.test.mjs`
Expected: FAIL because `ai` is not yet present in `VISIBLE_ROLE_TABS`.

- [ ] **Step 3: Write minimal implementation**

```ts
export type RoleView = 'product' | 'design' | 'develop' | 'test' | 'operations' | 'ai';

export const VISIBLE_ROLE_TABS: RoleTab[] = [
  { id: 'product', label: '产品' },
  { id: 'design', label: '设计' },
  { id: 'ai', label: 'AI' },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/claude-page.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/appNavigation.ts tests/ai/claude-page.test.mjs
git commit -m "feat: add dedicated ai role tab"
```

### Task 2: Restore workbench layout and route AI as a main-area page

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `tests/ai/claude-page.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('desktop layout keeps main workbench plus side ai pane for non-ai roles', async () => {
  const source = await readFile('src/App.tsx', 'utf8');
  assert.match(source, /currentRole === 'ai'/);
  assert.match(source, /<main className="app-main app-main-desktop">\{appMainContent\}<\/main>/);
  assert.match(source, /<aside className="app-ai-activity-pane">/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/claude-page.test.mjs`
Expected: FAIL if the app still unconditionally promotes AI to full page in desktop mode.

- [ ] **Step 3: Write minimal implementation**

```tsx
const isAIPage = currentRole === 'ai';

const appMainContent = isProjectManagerOpen ? (
  <ProjectSetup ... />
) : isAIPage ? (
  <ClaudePage />
) : (
  <>
    {currentRole === 'product' ? renderProductView() : null}
    {currentRole === 'design' ? renderDesignView() : null}
    {currentRole === 'develop' ? renderDevelopView() : null}
    {currentRole === 'test' ? renderTestView() : null}
    {currentRole === 'operations' ? renderOperationsView() : null}
  </>
);

return (
  <div className="app-workbench-row">
    {isDesktopWorkbenchMode ? (
      <Allotment ...>
        <Allotment.Pane minSize={640}>
          <main className="app-main app-main-desktop">{appMainContent}</main>
        </Allotment.Pane>
        {!isAIPage ? (
          <Allotment.Pane ...>
            <aside className="app-ai-activity-pane">
              <AIWorkspace />
            </aside>
          </Allotment.Pane>
        ) : null}
      </Allotment>
    ) : (
      <main className="app-main app-main-desktop">{appMainContent}</main>
    )}
  </div>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/claude-page.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.css tests/ai/claude-page.test.mjs
git commit -m "fix: route ai as dedicated main page without breaking workbench"
```

### Task 3: Create a dedicated Claude full-page container

**Files:**
- Create: `src/components/ai/ClaudePage.tsx`
- Create: `src/components/ai/ClaudePage.css`
- Modify: `src/App.tsx`
- Test: `tests/ai/claude-page.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('app renders a dedicated Claude page component for the ai role', async () => {
  const appSource = await readFile('src/App.tsx', 'utf8');
  const pageSource = await readFile('src/components/ai/ClaudePage.tsx', 'utf8');
  assert.match(appSource, /import\s+\{\s*ClaudePage\s*\}\s+from '\.\/components\/ai\/ClaudePage'/);
  assert.match(pageSource, /className="claude-page"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/claude-page.test.mjs`
Expected: FAIL because `ClaudePage.tsx` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
import React from 'react';
import { ClaudianWorkspace } from './ClaudianWorkspace';
import './ClaudePage.css';

export const ClaudePage: React.FC = () => (
  <section className="claude-page">
    <ClaudianWorkspace mode="full-page" />
  </section>
);
```

```css
.claude-page {
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #f6f1e8;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/claude-page.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ai/ClaudePage.tsx src/components/ai/ClaudePage.css src/App.tsx tests/ai/claude-page.test.mjs
git commit -m "feat: add dedicated claude page container"
```

### Task 4: Split panel AI shell from full-page Claude shell

**Files:**
- Modify: `src/components/ai/ClaudianWorkspace.tsx`
- Modify: `src/components/ai/AIWorkspace.tsx`
- Modify: `src/components/ai/AIWorkspace.css`
- Test: `tests/ai/ai-workspace.test.mjs`
- Test: `tests/ai/claude-page.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
test('ai workspace remains the floating or split-pane assistant shell', async () => {
  const source = await readFile('src/components/ai/AIWorkspace.tsx', 'utf8');
  assert.match(source, /className="floating-ai-workspace"/);
});

test('claudian workspace accepts a mode prop for panel vs full-page rendering', async () => {
  const source = await readFile('src/components/ai/ClaudianWorkspace.tsx', 'utf8');
  assert.match(source, /mode\?: 'panel' \| 'full-page'/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/ai/ai-workspace.test.mjs tests/ai/claude-page.test.mjs`
Expected: FAIL because `ClaudianWorkspace` has no explicit mode split yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
type ClaudianWorkspaceProps = {
  mode?: 'panel' | 'full-page';
};

export const ClaudianWorkspace: React.FC<ClaudianWorkspaceProps> = ({ mode = 'panel' }) => {
  return (
    <section className={`claudian-workspace claudian-workspace-${mode}`}>
      ...
      <div className="claudian-chat-pane claudian-tab-content">
        <AIChat variant={mode === 'full-page' ? 'claudian-full-page' : 'claudian-embedded'} />
      </div>
    </section>
  );
};
```

```tsx
export const AIWorkspace: React.FC = () => (
  <section className="floating-ai-workspace">
    <div className="ai-workspace-shell">
      <div className="ai-workspace-body">
        <ClaudianWorkspace mode="panel" />
      </div>
    </div>
  </section>
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/ai/ai-workspace.test.mjs tests/ai/claude-page.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ai/AIWorkspace.tsx src/components/ai/ClaudianWorkspace.tsx src/components/ai/AIWorkspace.css tests/ai/ai-workspace.test.mjs tests/ai/claude-page.test.mjs
git commit -m "refactor: separate ai panel shell from claude full page shell"
```

### Task 5: Give AIChat an explicit full-page variant instead of mixed embedded hacks

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/AIChat.css`
- Modify: `src/components/ai/claudian/ClaudianEmbeddedPieces.tsx`
- Test: `tests/ai/claude-page.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('ai chat exposes distinct panel and full-page variants', async () => {
  const source = await readFile('src/components/workspace/AIChat.tsx', 'utf8');
  assert.match(source, /variant\?: 'default' \| 'claudian-embedded' \| 'claudian-full-page'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/claude-page.test.mjs`
Expected: FAIL because there is no dedicated full-page variant yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
type AIChatProps = {
  variant?: 'default' | 'claudian-embedded' | 'claudian-full-page';
};

const isClaudianFullPage = variant === 'claudian-full-page';
const isClaudianEmbedded = variant === 'claudian-embedded';
```

```css
.chat-shell.chat-shell-full-page {
  position: relative;
  inset: auto;
  width: 100%;
  height: 100%;
  background: #f6f1e8;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/claude-page.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/workspace/AIChat.tsx src/components/workspace/AIChat.css src/components/ai/claudian/ClaudianEmbeddedPieces.tsx tests/ai/claude-page.test.mjs
git commit -m "refactor: add explicit claude full page chat variant"
```

### Task 6: Remove accidental global Claude theming from app shell

**Files:**
- Modify: `src/App.css`
- Test: `tests/ai/claude-page.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('global app shell keeps workbench theme variables separate from claude page css', async () => {
  const source = await readFile('src/App.css', 'utf8');
  assert.doesNotMatch(source, /app-workbench-pane-full-ai/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/claude-page.test.mjs`
Expected: FAIL if full-page AI styling still lives in `App.css`.

- [ ] **Step 3: Write minimal implementation**

```css
/* Remove Claude page visual rules from App.css. Keep only generic workbench layout here. */
```

Move Claude-specific background/color/layout rules into:

```css
/* src/components/ai/ClaudePage.css */
.claude-page {
  background: #f6f1e8;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/claude-page.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.css src/components/ai/ClaudePage.css tests/ai/claude-page.test.mjs
git commit -m "refactor: isolate claude page styling from global app shell"
```

### Task 7: Verify end-to-end behavior and document the split

**Files:**
- Modify: `tests/ai/claude-page.test.mjs`
- Modify: `tests/ai/ai-workspace.test.mjs`
- Optional docs note: `README.md` only if this project documents navigation modes there

- [ ] **Step 1: Add final source-level verification tests**

```js
test('desktop app still renders AIWorkspace in the side pane for non-ai roles', async () => {
  const source = await readFile('src/App.tsx', 'utf8');
  assert.match(source, /!isAIPage \? \(/);
  assert.match(source, /<AIWorkspace \/>/);
});

test('desktop app renders ClaudePage in appMainContent for ai role', async () => {
  const source = await readFile('src/App.tsx', 'utf8');
  assert.match(source, /isAIPage \? \(\s*<ClaudePage \/>/);
});
```

- [ ] **Step 2: Run the focused verification suite**

Run: `node --test tests/ai/ai-workspace.test.mjs tests/ai/claude-page.test.mjs`
Expected: PASS

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Manual verification checklist**

Run the app and verify:

```text
1. 产品/设计页面恢复正常显示，不再被 AI 全页覆盖。
2. 右侧 AI pane 仍存在于非 AI role 的桌面工作台。
3. 点击 AI tab 后，主区域显示 Claude 页面，而不是右侧挂件放大版。
4. Claude 页面中消息、引用、历史、输入仍可用。
```

- [ ] **Step 5: Commit**

```bash
git add tests/ai/claude-page.test.mjs tests/ai/ai-workspace.test.mjs src/App.tsx src/components/ai/ClaudePage.tsx src/components/ai/ClaudianWorkspace.tsx src/components/workspace/AIChat.tsx
git commit -m "feat: add dedicated claude page without breaking workbench"
```

## Self-Review

- Spec coverage: This plan covers the two hard requirements the current implementation violated: restore the existing multi-page workbench and stop forcing the Claude UI into the side panel shape.
- Placeholder scan: No `TODO` or `TBD` markers remain. Each task names exact files and verification commands.
- Type consistency: The plan consistently uses `RoleView = 'ai'`, `ClaudePage`, `ClaudianWorkspace mode`, and `AIChat variant`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-26-dedicated-claude-page.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
