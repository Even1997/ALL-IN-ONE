# AI Chat Codex-Like Composer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the AI chat sidebar header and composer into a Codex-like, icon-first layout without changing the existing reference-scope behavior or prompt logic.

**Architecture:** Keep all current chat/reference handlers in `AIChat.tsx`, but reorganize the JSX into a thinner icon header, a unified composer card, a `+` popover for reference actions, compact chips for selected files, and a weaker metadata row for model/context status. Update only the local chat CSS and source-level UI tests so the redesign stays surgical.

**Tech Stack:** React 19, TypeScript, local CSS, Node `--test` source assertions, Vite build

---

### Task 1: Lock the Codex-like UI source contract with failing tests

**Files:**
- Modify: `tests/ai/ai-chat-reference-ui.test.mjs`
- Modify: `tests/ai/ai-chat-view-state.test.mjs`

- [ ] **Step 1: Replace the old “text scope buttons on main surface” assertion with Codex-like source assertions**

```js
test('AIChat uses icon-first composer controls and a unified reference menu trigger', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /chat-composer-plus-btn/);
  assert.match(source, /chat-composer-icon-btn/);
  assert.match(source, /chat-reference-menu/);
  assert.match(source, /handleApplyReferenceScope/);
  assert.match(source, /selectedReferenceFileIds/);
});
```

- [ ] **Step 2: Add a source assertion that the main composer no longer shows the four reference text buttons inline**

```js
test('AIChat keeps reference scope actions out of the main composer surface', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.doesNotMatch(source, /chat-reference-scope-actions/);
  assert.match(source, /chat-reference-menu-action/);
});
```

- [ ] **Step 3: Add view-state level assertions for the new icon-first shell**

```js
test('AIChat source keeps a compact icon-first header and composer shell', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /chat-shell-icon-btn/);
  assert.match(source, /chat-composer-meta/);
  assert.match(source, /chat-selected-reference-chips/);
});
```

- [ ] **Step 4: Run the focused UI source tests to verify they fail**

Run: `node --test tests/ai/ai-chat-reference-ui.test.mjs tests/ai/ai-chat-view-state.test.mjs`

Expected: FAIL because the current UI still contains the old text-heavy structure.

### Task 2: Refactor `AIChat.tsx` into an icon-first Codex-like structure

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Test: `tests/ai/ai-chat-reference-ui.test.mjs`
- Test: `tests/ai/ai-chat-view-state.test.mjs`

- [ ] **Step 1: Add local inline SVG icon helpers near the top of `AIChat.tsx`**

```tsx
const PlusIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
    <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const HistoryIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
    <path d="M3.5 10a6.5 6.5 0 1 0 2-4.68" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M3.5 4.5v3h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
```

- [ ] **Step 2: Add compact UI state for the reference popover**

```tsx
const [showReferenceMenu, setShowReferenceMenu] = useState(false);
```

- [ ] **Step 3: Replace the header text buttons with icon-only buttons while preserving behavior**

```tsx
<button
  className="chat-shell-icon-btn"
  type="button"
  aria-label="历史会话"
  title="历史会话"
  onClick={() => {
    setShowHistoryMenu((current) => !current);
    setShowSkillMenu(false);
    setShowReferenceMenu(false);
  }}
>
  <HistoryIcon />
</button>
```

- [ ] **Step 4: Remove the old stacked reference block from the composer**

```tsx
// Delete the old .chat-reference-scope block entirely
```

- [ ] **Step 5: Insert a selected-chip row above the input only when files exist**

```tsx
{selectedReferenceFiles.length > 0 ? (
  <div className="chat-selected-reference-chips">
    {selectedReferenceFiles.map((file) => (
      <button
        key={file.id}
        type="button"
        className="chat-reference-chip compact"
        onClick={() => handleRemoveReferenceFile(file.id)}
        title={file.path}
      >
        <FileIcon />
        <span>{file.title}</span>
      </button>
    ))}
  </div>
) : null}
```

- [ ] **Step 6: Add the new unified `+` button and popover menu inside the composer row**

```tsx
<button
  type="button"
  className="chat-composer-plus-btn"
  aria-label="上下文与引用"
  title="上下文与引用"
  onClick={() => {
    setShowReferenceMenu((current) => !current);
    setShowSkillMenu(false);
  }}
>
  <PlusIcon />
</button>

{showReferenceMenu ? (
  <div className="chat-reference-menu">
    <button type="button" className="chat-reference-menu-action" onClick={() => handleApplyReferenceScope('current')}>
      引用当前
    </button>
    <button type="button" className="chat-reference-menu-action" onClick={() => handleApplyReferenceScope('directory')}>
      引用目录
    </button>
    <button type="button" className="chat-reference-menu-action" onClick={() => handleApplyReferenceScope('all')}>
      引用全部
    </button>
    <button type="button" className="chat-reference-menu-action" onClick={() => void handleRebuildContextIndex()}>
      整理索引
    </button>
  </div>
) : null}
```

- [ ] **Step 7: Convert the `Skill` text button into an icon-only secondary action**

```tsx
<button
  type="button"
  className="chat-composer-icon-btn"
  aria-label="Skill 菜单"
  title="Skill 菜单"
  onClick={() => {
    setShowSkillMenu((current) => !current);
    setShowReferenceMenu(false);
  }}
>
  <SparkIcon />
</button>
```

- [ ] **Step 8: Move model name and context budget into a weak metadata row under the input**

```tsx
<div className="chat-composer-meta">
  <span>{selectedRuntimeConfig ? selectedRuntimeConfig.name : '未启用 AI'}</span>
  <span>{currentContextUsage.usedLabel} / {currentContextUsage.limitLabel}</span>
</div>
```

- [ ] **Step 9: Keep the current send logic, textarea, skill menu, history menu, and settings drawer behavior intact**

```tsx
// Preserve existing handlers:
// handleSubmit
// handleCreateSession
// insertSkillToken
// handleApplyReferenceScope
// handleReferenceDirectoryChange
// handleAddReferenceFile
// handleRemoveReferenceFile
```

- [ ] **Step 10: Run the focused UI source tests to verify they pass**

Run: `node --test tests/ai/ai-chat-reference-ui.test.mjs tests/ai/ai-chat-view-state.test.mjs`

Expected: PASS

### Task 3: Rewrite `AIChat.css` around the new icon-first shell

**Files:**
- Modify: `src/components/workspace/AIChat.css`
- Test: `tests/ai/ai-chat-reference-ui.test.mjs`

- [ ] **Step 1: Add a shared icon-button style for header and composer controls**

```css
.chat-shell-icon-btn,
.chat-composer-icon-btn,
.chat-composer-plus-btn {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mode-border, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  background: color-mix(in srgb, var(--mode-panel-alt, rgba(255, 255, 255, 0.05)) 92%, transparent);
  color: var(--mode-text, #f8fafc);
  cursor: pointer;
}
```

- [ ] **Step 2: Slim down the header spacing and remove large pill-button dependence**

```css
.chat-shell-header {
  gap: 12px;
  padding: 14px 16px;
}

.chat-shell-header-actions {
  gap: 6px;
}
```

- [ ] **Step 3: Redefine the composer shell as one compact surface**

```css
.chat-composer-shell {
  gap: 10px;
  padding: 10px;
  border-radius: 20px;
}

.chat-composer-main {
  align-items: center;
  gap: 10px;
}
```

- [ ] **Step 4: Replace the old reference block styles with popover styles**

```css
.chat-reference-menu {
  position: absolute;
  left: 12px;
  bottom: calc(100% + 10px);
  width: 260px;
  padding: 10px;
  display: grid;
  gap: 8px;
  border-radius: 18px;
}

.chat-reference-menu-action {
  min-height: 36px;
  padding: 0 12px;
  text-align: left;
}
```

- [ ] **Step 5: Add compact chip row and metadata row styles**

```css
.chat-selected-reference-chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}

.chat-composer-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--mode-muted, rgba(255, 255, 255, 0.56));
  font-size: 11px;
}
```

- [ ] **Step 6: Keep mobile behavior intact by stacking only what is necessary**

```css
@media (max-width: 900px) {
  .chat-composer-meta {
    flex-direction: column;
    align-items: flex-start;
  }
}
```

- [ ] **Step 7: Run the focused UI source tests again**

Run: `node --test tests/ai/ai-chat-reference-ui.test.mjs`

Expected: PASS

### Task 4: Verify the full redesign against existing chat behavior

**Files:**
- Verify only

- [ ] **Step 1: Run the affected AI chat test suite**

Run: `node --test tests/ai/*.test.mjs`

Expected: PASS

- [ ] **Step 2: Run broader adjacent UI regression checks**

Run: `node --test tests/knowledge-tree.test.mjs tests/product-workbench.test.mjs`

Expected: PASS

- [ ] **Step 3: Run the application build**

Run: `npm run build`

Expected: exit 0

- [ ] **Step 4: Manually verify the redesign in-app**

Checklist:

- Header is icon-first.
- Composer is one surface instead of stacked panels.
- `+` menu exposes reference actions.
- Selected file chips are compact.
- Model and context status are visible but subdued.
- Send remains the strongest visual action.
