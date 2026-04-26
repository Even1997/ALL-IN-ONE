# Desktop Workbench UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the app into a desktop-style workbench, excluding the design page, and add opened-file tabs to the product knowledge view.

**Architecture:** Keep existing React components and stores. Add lightweight local pane-size state and pointer handlers in layout components, move the AI chat to a dockable right-pane presentation with CSS, and keep knowledge tabs local to `ProductWorkbench`.

**Tech Stack:** React 19, TypeScript, Zustand, Vite, Tauri, source-level Node tests.

---

### Task 1: Source Tests

**Files:**
- Create: `tests/desktop-workbench-ui.test.mjs`
- Modify: none

- [ ] **Step 1: Add source assertions**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../src/App.tsx');
const appCssPath = path.resolve(__dirname, '../src/App.css');
const workspacePath = path.resolve(__dirname, '../src/components/workspace/Workspace.tsx');
const workspaceCssPath = path.resolve(__dirname, '../src/components/workspace/Workspace.css');
const chatCssPath = path.resolve(__dirname, '../src/components/workspace/AIChat.css');
const productPath = path.resolve(__dirname, '../src/components/product/ProductWorkbench.tsx');

test('desktop app shell exposes edge-to-edge workbench classes', async () => {
  const source = await readFile(appPath, 'utf8');
  const css = await readFile(appCssPath, 'utf8');
  assert.match(source, /app-shell-desktop/);
  assert.match(css, /\.app-shell-desktop\s*\{/);
  assert.match(css, /\.app-main-desktop\s*\{/);
  assert.match(css, /height:\s*calc\(100vh - var\(--desktop-topbar-height\)\)/);
});

test('workspace exposes horizontal and vertical resize splitters', async () => {
  const source = await readFile(workspacePath, 'utf8');
  const css = await readFile(workspaceCssPath, 'utf8');
  assert.match(source, /workspace-resizer vertical/);
  assert.match(source, /workspace-resizer horizontal/);
  assert.match(source, /handlePaneResizePointerDown/);
  assert.match(css, /\.workspace-resizer\.vertical\s*\{/);
  assert.match(css, /cursor:\s*col-resize;/);
  assert.match(css, /\.workspace-resizer\.horizontal\s*\{/);
  assert.match(css, /cursor:\s*row-resize;/);
});

test('ai chat supports docked desktop pane styling', async () => {
  const css = await readFile(chatCssPath, 'utf8');
  assert.match(css, /body\.desktop-workbench-mode \.chat-shell/);
  assert.match(css, /position:\s*relative;/);
  assert.match(css, /width:\s*100%;/);
});

test('product knowledge view renders opened-file tab strip', async () => {
  const source = await readFile(productPath, 'utf8');
  assert.match(source, /openKnowledgeTabIds/);
  assert.match(source, /pm-knowledge-open-tabs/);
  assert.match(source, /handleCloseKnowledgeTab/);
  assert.match(source, /setSelectedRequirementId\(tab\.id\)/);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/desktop-workbench-ui.test.mjs`
Expected: fails before implementation because the new classes and tab state do not exist.

### Task 2: Desktop App Shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add desktop body mode**

In `App.tsx`, add a `useEffect` that toggles `desktop-workbench-mode` on `document.body` while the app is mounted with an active project.

- [ ] **Step 2: Add desktop shell classes**

Change the root markup to include `app-shell-desktop`, and change `<main className="app-main">` to `<main className="app-main app-main-desktop">`.

- [ ] **Step 3: Flatten global workspace CSS**

In `App.css`, define `--desktop-topbar-height`, make `.app` fill `100vh`, make `.app-main-desktop` edge-to-edge, and remove large padding/gaps from Product, Develop, Test, and Operations wrappers. Keep design-specific selectors unchanged.

### Task 3: Resizable Workspace Panes

**Files:**
- Modify: `src/components/workspace/Workspace.tsx`
- Modify: `src/components/workspace/Workspace.css`

- [ ] **Step 1: Add pane-size state**

Add local state for left sidebar width, right activity width, and bottom terminal height with clamp helpers.

- [ ] **Step 2: Add pointer resize handlers**

Add `handlePaneResizePointerDown(axis)` using `pointermove` and `pointerup` listeners on `window`.

- [ ] **Step 3: Render splitters and desktop panes**

Insert vertical splitters between sidebar/main and main/activity. Insert a horizontal splitter above the bottom terminal. Keep existing file explorer, editor, and terminal behavior.

- [ ] **Step 4: Flatten workspace CSS**

Remove rounded shell treatment from `.workspace`, `.workspace-content`, `.split-terminal`, and related wrappers. Add `.workspace-resizer.vertical` and `.workspace-resizer.horizontal`.

### Task 4: Docked AI Pane

**Files:**
- Modify: `src/components/workspace/AIChat.css`

- [ ] **Step 1: Add desktop dock override**

Add `body.desktop-workbench-mode .chat-shell` rules so chat becomes relative, fills its parent width/height, and loses fixed top/right/bottom positioning.

- [ ] **Step 2: Keep mobile fallback**

Keep existing `@media (max-width: 900px)` fixed/bottom-sheet behavior by overriding the desktop rule inside the media block.

### Task 5: Knowledge Open Tabs

**Files:**
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add local open tab state**

Add `const [openKnowledgeTabIds, setOpenKnowledgeTabIds] = useState<string[]>([]);` near current knowledge selection state.

- [ ] **Step 2: Open tabs when selecting knowledge**

When `selectedKnowledgeEntry` changes, append its id to `openKnowledgeTabIds` if absent.

- [ ] **Step 3: Render tab strip**

Above the knowledge file header, render `.pm-knowledge-open-tabs` with one button per open entry and a close button.

- [ ] **Step 4: Close tab behavior**

Implement `handleCloseKnowledgeTab(id)` so closing the active tab selects the previous, next, or first available knowledge entry.

- [ ] **Step 5: Style tabs**

Add compact desktop tab styling in `App.css`, with no outer margin and clear active state.

### Task 6: Verification

**Files:**
- Modify: none

- [ ] **Step 1: Run focused source tests**

Run: `node --test tests/desktop-workbench-ui.test.mjs`
Expected: PASS.

- [ ] **Step 2: Run TypeScript build**

Run: `npm run build`
Expected: PASS.
