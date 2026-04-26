# Allotment Global Layout Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the major desktop splitters with `Allotment` and persist pane sizes globally across reloads.

**Architecture:** Add a thin layout-preferences helper for shared localStorage read/write/clamp logic, then migrate `ProductWorkbench`, `Workspace`, and the desktop AI pane to consume that helper. Keep responsive breakpoints and existing pane contents intact while swapping the resize mechanism.

**Tech Stack:** React 19, TypeScript, Vite, Tauri, Allotment, node:test

---

### Task 1: Add dependency and shared layout preference helper

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/utils/layoutPreferences.ts`
- Test: `tests/layout-preferences.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampLayoutSize,
  readLayoutSize,
  writeLayoutSize,
} from '../src/utils/layoutPreferences.ts';

test('layout preference helpers clamp and persist numeric pane sizes', () => {
  const store = new Map();
  const storage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };

  assert.equal(readLayoutSize('layout.test.width', 280, { min: 200, max: 420 }, storage), 280);
  writeLayoutSize('layout.test.width', 999, { min: 200, max: 420 }, storage);
  assert.equal(store.get('layout.test.width'), '420');
  assert.equal(clampLayoutSize(120, { min: 200, max: 420 }), 200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/layout-preferences.test.mjs`
Expected: FAIL because `src/utils/layoutPreferences.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export type LayoutSizeBounds = { min: number; max: number };

export const clampLayoutSize = (value: number, bounds: LayoutSizeBounds) =>
  Math.min(bounds.max, Math.max(bounds.min, value));
```

Add storage-safe `readLayoutSize` and `writeLayoutSize` helpers in the same file.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/layout-preferences.test.mjs`
Expected: PASS

### Task 2: Migrate product workbench left navigation to Allotment

**Files:**
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/App.css`
- Test: `tests/desktop-workbench-ui.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('product workbench uses Allotment for the left navigation split', async () => {
  const source = await readFile(productPath, 'utf8');
  assert.match(source, /from 'allotment'/);
  assert.match(source, /layout\.productWorkbench\.leftNavWidth/);
  assert.match(source, /<Allotment/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/desktop-workbench-ui.test.mjs`
Expected: FAIL because `ProductWorkbench` still uses the fixed grid divider.

- [ ] **Step 3: Write minimal implementation**

```tsx
<Allotment onChange={handleProductPaneChange}>
  <Allotment.Pane minSize={200} maxSize={420} preferredSize={leftNavWidth}>
    <aside className="pm-left-nav">...</aside>
  </Allotment.Pane>
  <Allotment.Pane minSize={480}>
    <main className="pm-main-viewer">...</main>
  </Allotment.Pane>
</Allotment>
```

Keep the narrow-screen fallback outside the Allotment branch.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/desktop-workbench-ui.test.mjs`
Expected: PASS for the product workbench assertions.

### Task 3: Migrate workspace splitters to Allotment

**Files:**
- Modify: `src/components/workspace/Workspace.tsx`
- Modify: `src/components/workspace/Workspace.css`
- Test: `tests/desktop-workbench-ui.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('workspace uses Allotment instead of manual pointer resize handlers', async () => {
  const source = await readFile(workspacePath, 'utf8');
  assert.match(source, /from 'allotment'/);
  assert.match(source, /layout\.workspace\.sidebarWidth/);
  assert.match(source, /layout\.workspace\.activityWidth/);
  assert.match(source, /layout\.workspace\.terminalHeight/);
  assert.doesNotMatch(source, /handlePaneResizePointerDown/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/desktop-workbench-ui.test.mjs`
Expected: FAIL because the workspace still uses manual resize handlers and legacy resizer nodes.

- [ ] **Step 3: Write minimal implementation**

```tsx
<Allotment onChange={handleOuterLayoutChange}>
  <Allotment.Pane preferredSize={sidebarWidth} minSize={200} maxSize={420}>...</Allotment.Pane>
  <Allotment.Pane minSize={480}>
    <Allotment vertical onChange={handleInnerLayoutChange}>
      <Allotment.Pane>...</Allotment.Pane>
      <Allotment.Pane preferredSize={terminalHeight} minSize={120} maxSize={420}>...</Allotment.Pane>
    </Allotment>
  </Allotment.Pane>
  <Allotment.Pane preferredSize={activityWidth} minSize={48} maxSize={220}>...</Allotment.Pane>
</Allotment>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/desktop-workbench-ui.test.mjs`
Expected: PASS for the workspace assertions.

### Task 4: Persist desktop AI pane width through the shared helper

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `tests/desktop-workbench-ui.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('desktop ai pane reads and writes shared layout preference keys', async () => {
  const source = await readFile(appPath, 'utf8');
  assert.match(source, /layout\.desktop\.aiPaneWidth/);
  assert.match(source, /readLayoutSize/);
  assert.match(source, /writeLayoutSize/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/desktop-workbench-ui.test.mjs`
Expected: FAIL because `App.tsx` still uses local component state only.

- [ ] **Step 3: Write minimal implementation**

```tsx
const [desktopAiPaneWidth, setDesktopAiPaneWidth] = useState(() =>
  readLayoutSize(LAYOUT_KEYS.desktopAiPaneWidth, 420, AI_PANE_WIDTH_BOUNDS)
);
```

Write updated widths back through the helper inside the existing drag path.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/desktop-workbench-ui.test.mjs`
Expected: PASS for the AI pane persistence assertions.

### Task 5: Verify build and focused tests

**Files:**
- Modify: `tests/desktop-workbench-ui.test.mjs`
- Modify: `tests/layout-preferences.test.mjs`

- [ ] **Step 1: Run focused tests**

Run: `node --test tests/layout-preferences.test.mjs tests/desktop-workbench-ui.test.mjs`
Expected: PASS

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: successful TypeScript compile and Vite build

- [ ] **Step 3: Review changed files**

Run: `git diff -- package.json package-lock.json src/App.tsx src/App.css src/components/product/ProductWorkbench.tsx src/components/workspace/Workspace.tsx src/components/workspace/Workspace.css src/utils/layoutPreferences.ts tests/layout-preferences.test.mjs tests/desktop-workbench-ui.test.mjs`
Expected: only the planned Allotment and layout-persistence changes appear
