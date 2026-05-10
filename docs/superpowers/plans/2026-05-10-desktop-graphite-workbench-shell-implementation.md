# Desktop Graphite Workbench Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frameless desktop shell feel smoother and more polished by fixing titlebar drag/maximize behavior, reducing AI pane resize jank, and restyling the shell to a solid graphite look without blur.

**Architecture:** Extract the desktop shell interaction math into a small helper module so resize behavior can be tested outside the React tree, then simplify the titlebar to dedicated drag-only hit zones while using refs plus `requestAnimationFrame` to avoid full-app rerenders during live resize. Refresh the shell CSS with desktop-scoped graphite tokens and remove blur-heavy top-level chrome, including the Tauri window effect configuration.

**Tech Stack:** React 19, TypeScript, Tauri 2, CSS, Node built-in test runner

---

### Task 1: Add desktop shell interaction helpers and regression tests

**Files:**
- Create: `src/features/desktopShell/desktopShell.ts`
- Create: `src/features/desktopShell/desktopShell.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampDesktopAiPaneWidth,
  getDesktopAiPaneWidthFromPointer,
  isDesktopTopbarInteractiveTarget,
} from './desktopShell.ts';

test('clampDesktopAiPaneWidth keeps width inside bounds', () => {
  assert.equal(clampDesktopAiPaneWidth(120, { min: 280, max: 520 }), 280);
  assert.equal(clampDesktopAiPaneWidth(680, { min: 280, max: 520 }), 520);
  assert.equal(clampDesktopAiPaneWidth(360, { min: 280, max: 520 }), 360);
});

test('getDesktopAiPaneWidthFromPointer calculates width from drag delta', () => {
  assert.equal(
    getDesktopAiPaneWidthFromPointer({
      startWidth: 360,
      startPointerX: 1000,
      currentPointerX: 940,
      bounds: { min: 280, max: 520 },
    }),
    420
  );
});

test('isDesktopTopbarInteractiveTarget ignores controls and menus', () => {
  const button = document.createElement('button');
  const wrapper = document.createElement('div');
  wrapper.append(button);

  assert.equal(isDesktopTopbarInteractiveTarget(button), true);
  assert.equal(isDesktopTopbarInteractiveTarget(wrapper), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/features/desktopShell/desktopShell.test.ts`
Expected: FAIL with module-not-found or missing export errors for `desktopShell.ts`

- [ ] **Step 3: Write minimal implementation**

```ts
export type DesktopPaneBounds = {
  min: number;
  max: number;
};

export const clampDesktopAiPaneWidth = (value: number, bounds: DesktopPaneBounds): number =>
  Math.min(bounds.max, Math.max(bounds.min, value));

export const getDesktopAiPaneWidthFromPointer = ({
  startWidth,
  startPointerX,
  currentPointerX,
  bounds,
}: {
  startWidth: number;
  startPointerX: number;
  currentPointerX: number;
  bounds: DesktopPaneBounds;
}): number => clampDesktopAiPaneWidth(startWidth + startPointerX - currentPointerX, bounds);

const INTERACTIVE_SELECTOR =
  'button, input, select, textarea, a, [role="menu"], [role="menuitem"], [data-app-menu-root="desktop"], .mac-field, .mac-select-shell, .desktop-window-controls';

export const isDesktopTopbarInteractiveTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement ? Boolean(target.closest(INTERACTIVE_SELECTOR)) : false;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/features/desktopShell/desktopShell.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/desktopShell/desktopShell.ts src/features/desktopShell/desktopShell.test.ts
git commit -m "test: add desktop shell interaction helpers"
```

### Task 2: Smooth desktop drag and AI pane resize behavior in React

**Files:**
- Modify: `src/App.tsx`
- Test: `src/features/desktopShell/desktopShell.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('getDesktopAiPaneWidthFromPointer clamps overshoot during resize drag', () => {
  assert.equal(
    getDesktopAiPaneWidthFromPointer({
      startWidth: 360,
      startPointerX: 1000,
      currentPointerX: 400,
      bounds: { min: 280, max: 520 },
    }),
    520
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/features/desktopShell/desktopShell.test.ts`
Expected: FAIL because clamp behavior is not yet covered or helper is incomplete

- [ ] **Step 3: Write minimal implementation**

```ts
const desktopAiPaneElementRef = useRef<HTMLDivElement | null>(null);
const desktopAiPaneWidthRef = useRef(desktopAiPaneWidth);
const desktopAiResizeFrameRef = useRef<number | null>(null);
const desktopAiResizeDraftRef = useRef<number | null>(null);

const commitDesktopAiPaneWidth = useCallback((nextWidth: number) => {
  desktopAiPaneWidthRef.current = nextWidth;
  setDesktopAiPaneWidth(nextWidth);
}, []);

const flushDesktopAiPaneWidth = useCallback((nextWidth: number) => {
  const pane = desktopAiPaneElementRef.current;
  if (!pane) return;
  pane.style.width = `${nextWidth}px`;
  pane.style.flexBasis = `${nextWidth}px`;
}, []);

const handleDesktopAiResizePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
  // store drag start, update element style in rAF during pointermove,
  // and only call setDesktopAiPaneWidth once on pointerup
}, [flushDesktopAiPaneWidth, isDesktopAiPaneVisible, showWorkspaceSidebar]);
```

- [ ] **Step 4: Run test and type verification**

Run: `node --test --experimental-strip-types src/features/desktopShell/desktopShell.test.ts`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/features/desktopShell/desktopShell.ts src/features/desktopShell/desktopShell.test.ts
git commit -m "feat: smooth desktop drag and ai pane resize"
```

### Task 3: Apply graphite solid shell styling and remove top-level blur

**Files:**
- Modify: `src/App.css`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Write the failing verification target**

```text
The desktop shell still uses blur-heavy topbar chrome, translucent menu panels, and Tauri window effects instead of the approved solid graphite shell.
```

- [ ] **Step 2: Run verification to confirm the old state**

Run: `Select-String -Path src\App.css,src-tauri\tauri.conf.json -Pattern 'backdrop-filter|windowEffects|transparent'`
Expected: MATCHES for desktop shell blur or Tauri window effect settings

- [ ] **Step 3: Write minimal implementation**

```css
.desktop-shell-codex {
  background:
    radial-gradient(circle at top left, rgba(87, 129, 255, 0.08), transparent 24%),
    linear-gradient(180deg, #151a22 0%, #0f1319 100%);
}

.desktop-workbench-topbar.mac-toolbar.mac-panel,
.app-shell-desktop .app-header,
.app-menu-panel {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.app-workbench-pane,
.desktop-primary-rail.mac-sidebar-panel,
.desktop-workbench-topbar.mac-toolbar.mac-panel {
  background: linear-gradient(180deg, rgba(28, 33, 43, 0.98), rgba(18, 22, 30, 0.98));
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.24);
}
```

```json
{
  "decorations": false,
  "transparent": false,
  "shadow": true
}
```

- [ ] **Step 4: Run build verification**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.css src-tauri/tauri.conf.json
git commit -m "feat: restyle desktop shell to graphite solid"
```
