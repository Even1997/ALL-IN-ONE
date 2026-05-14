# Settings Page Workbench UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the AI chat settings drawer so it follows the `ai-workbench.html` standard with a calmer desktop workbench shell, list-first navigation, one dominant editing surface, and quieter support panes.

**Architecture:** Keep this refactor in the presentation layer: `AIChat.tsx` owns the shared settings shell, `AIChatAISettingsTab.tsx` and `RuntimeMcpSettingsPage.tsx` own tab-specific surfaces, and `AIChat.css` owns the visual contract. Do not change runtime truth, provider behavior, MCP persistence, or settings state semantics unless a UI requirement cannot be met without it.

**Tech Stack:** React, TypeScript, CSS, Zustand, node:test

---

### Task 1: Lock The Workbench UI Contract In Tests

**Files:**
- Add: `tests/ai/ai-chat-settings-workbench-ui.test.mjs`
- Modify: `tests/ai/ai-chat-settings-skills-mcp.test.mjs`
- Modify: `tests/ai/ai-chat-ai-settings-tab-lazy-loading.test.mjs`

- [ ] **Step 1: Add a focused source-level test for the shared settings shell structure**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const cssPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.css');

test('ai chat settings drawer uses the workbench shell vocabulary', async () => {
  const [tsx, css] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(cssPath, 'utf8'),
  ]);

  assert.match(tsx, /chat-settings-workbench-shell/);
  assert.match(tsx, /chat-settings-workbench-sidebar/);
  assert.match(tsx, /chat-settings-workbench-stage/);
  assert.match(tsx, /chat-settings-workbench-companion/);
  assert.match(css, /\.chat-settings-workbench-shell\s*\{/);
  assert.match(css, /\.chat-settings-workbench-sidebar\s*\{/);
  assert.match(css, /\.chat-settings-workbench-stage\s*\{/);
  assert.match(css, /\.chat-settings-workbench-companion\s*\{/);
});
```

- [ ] **Step 2: Extend the existing tab tests so AI and MCP tabs must expose list-first stage layouts instead of legacy summary-card-heavy markup**

```js
assert.match(tabSource, /chat-settings-ai-layout/);
assert.match(tabSource, /chat-settings-provider-list/);
assert.match(tabSource, /chat-settings-ai-stage/);
assert.match(tabSource, /chat-settings-ai-companion/);
assert.doesNotMatch(tabSource, /chat-settings-summary-card/);

assert.match(pageSource, /chat-settings-mcp-layout/);
assert.match(pageSource, /chat-settings-mcp-list/);
assert.match(pageSource, /chat-settings-mcp-stage/);
assert.match(pageSource, /chat-settings-mcp-companion/);
assert.doesNotMatch(pageSource, /chat-settings-mcp-toolbar-bar/);
```

- [ ] **Step 3: Run the focused test slice and confirm it fails before implementation**

Run: `node --test tests/ai/ai-chat-settings-workbench-ui.test.mjs tests/ai/ai-chat-settings-skills-mcp.test.mjs tests/ai/ai-chat-ai-settings-tab-lazy-loading.test.mjs`

Expected: FAIL because the current shell still uses the older drawer/panel/card structure and the AI/MCP tabs do not yet expose the new workbench stage and companion regions.

### Task 2: Rebuild The Shared Settings Shell Around The Workbench Standard

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/AIChat.css`

- [ ] **Step 1: Replace the current drawer body composition with explicit workbench shell regions**

```tsx
<div className="chat-settings-workbench-shell">
  <aside className="chat-settings-workbench-sidebar">
    <div className="chat-settings-source-list">
      {SETTINGS_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`chat-settings-source-row${activeSettingsTab === tab.id ? ' active' : ''}`}
          onClick={() => setActiveSettingsTab(tab.id)}
        >
          <strong>{tab.label}</strong>
          <span>{tab.description}</span>
        </button>
      ))}
    </div>
  </aside>

  <div className="chat-settings-workbench-stage">
    {activeTabContent}
  </div>
</div>
```

- [ ] **Step 2: Restyle the settings chrome to match `ai-workbench.html` instead of the current modal-card rhythm**

```css
.chat-settings-workbench-shell {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  min-height: 0;
  height: 100%;
}

.chat-settings-workbench-sidebar {
  border-right: 1px solid var(--desktop-shell-border, rgba(255, 255, 255, 0.08));
  background: color-mix(in srgb, var(--desktop-shell-toolbar-bg-subtle, rgba(255, 255, 255, 0.02)) 88%, transparent);
  padding: 14px;
}

.chat-settings-source-row {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  text-align: left;
  border-radius: 10px;
}
```

- [ ] **Step 3: Convert placeholder tabs into quiet note-surface placeholders instead of generic cards**

```tsx
<div className="chat-settings-placeholder-note">
  <div className="chat-settings-eyebrow">{tab.eyebrow}</div>
  <strong>{tab.title}</strong>
  <p>{tab.description}</p>
</div>
```

- [ ] **Step 4: Run the shell-focused tests after the shared frame refactor**

Run: `node --test tests/ai/ai-chat-settings-workbench-ui.test.mjs tests/ai/ai-chat-settings-skills-mcp.test.mjs`

Expected: PASS for shell vocabulary and tab structure, while AI/MCP content-specific assertions may still fail until later tasks land.

### Task 3: Refactor The AI Settings Tab Into A Notes-First Editing Surface

**Files:**
- Modify: `src/components/workspace/AIChatAISettingsTab.tsx`
- Modify: `src/components/workspace/AIChat.css`
- Reuse: `src/components/workspace/useAIChatSettingsState.ts`

- [ ] **Step 1: Keep the existing data handlers but split the tab into source list, main stage, and companion pane**

```tsx
<div className="chat-settings-ai-layout">
  <aside className="chat-settings-provider-list">{providerRows}</aside>

  <section className="chat-settings-ai-stage">
    <article className="chat-settings-note-surface">
      <header className="chat-settings-note-header">{header}</header>
      <div className="chat-settings-note-sections">{formSections}</div>
      <footer className="chat-settings-note-actions">{primaryActions}</footer>
    </article>
  </section>

  <aside className="chat-settings-ai-companion">
    {statusPanels}
  </aside>
</div>
```

- [ ] **Step 2: Remove the heavy summary-card emphasis and move secondary context into the companion pane**

```tsx
<aside className="chat-settings-ai-companion">
  <section className="chat-settings-companion-panel">
    <strong>Current config</strong>
    <span>{providerTypeLabel(settingsDraft.provider)}</span>
    <span>{settingsDraft.enabled ? 'enabled' : 'disabled'}</span>
  </section>

  {testMessage ? (
    <section className={`chat-settings-companion-panel chat-settings-test-note ${testState}`}>
      {testMessage}
    </section>
  ) : null}
</aside>
```

- [ ] **Step 3: Rework the form groups so the main stage reads as one document rather than stacked cards**

```css
.chat-settings-note-surface {
  display: grid;
  gap: 18px;
  padding: 22px 24px;
  border: 1px solid var(--desktop-shell-border, rgba(255, 255, 255, 0.08));
  border-radius: 18px;
}

.chat-settings-note-sections {
  display: grid;
  gap: 18px;
}

.chat-settings-note-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-start;
}
```

- [ ] **Step 4: Preserve lazy-loading and settings state boundaries while updating the markup vocabulary**

Run: `node --test tests/ai/ai-chat-ai-settings-tab-lazy-loading.test.mjs tests/ai/ai-chat-settings-state-hook-boundary.test.mjs`

Expected: PASS with the tab still lazy-loaded from `AIChat.tsx` and all settings logic still owned by `useAIChatSettingsState.ts`.

### Task 4: Refactor The MCP Settings Tab Into A Workbench Editor With A Quiet Inspector

**Files:**
- Modify: `src/components/workspace/RuntimeMcpSettingsPage.tsx`
- Modify: `src/components/workspace/AIChat.css`
- Reuse: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Reuse: `src/modules/ai/runtime/mcp/runtimeMcpStore.ts`

- [ ] **Step 1: Replace the hero/toolbar treatment with the same source-list plus note-surface layout as the AI tab**

```tsx
<div className="chat-settings-mcp-layout">
  <aside className="chat-settings-mcp-list">{serverRows}</aside>

  <section className="chat-settings-mcp-stage">
    <article className="chat-settings-note-surface">
      <header className="chat-settings-note-header">{serverHeader}</header>
      <div className="chat-settings-note-sections">
        {connectionSection}
        {transportSection}
      </div>
      <footer className="chat-settings-note-actions">{serverActions}</footer>
    </article>
  </section>

  <aside className="chat-settings-mcp-companion">
    {inspectorPanels}
  </aside>
</div>
```

- [ ] **Step 2: Move server status, counts, and recent tool calls into companion panels so the editor stays the dominant surface**

```tsx
<aside className="chat-settings-mcp-companion">
  <section className="chat-settings-companion-panel">
    <strong>Server summary</strong>
    <span>{transportLabel(draft.transport)}</span>
    <span>{toolCount} tools</span>
    <span>{draft.enabled ? 'enabled' : 'disabled'}</span>
  </section>

  <section className="chat-settings-companion-panel">
    <strong>Recent tool calls</strong>
    {activeToolCalls.length > 0 ? activeToolCalls.map(renderToolCallRow) : <div className="chat-settings-mcp-empty">还没有工具调用记录。</div>}
  </section>
</aside>
```

- [ ] **Step 3: Keep CRUD and invoke behavior unchanged by reusing the existing handlers and bridge methods exactly as they are**

```ts
await initializeRuntimeSidecarMcpServers();
await upsertRuntimeSidecarMcpServer(server);
await deleteRuntimeSidecarMcpServer(serverId);
await invokeRuntimeSidecarMcpTool({
  threadId,
  serverId,
  toolName,
});
```

- [ ] **Step 4: Run the MCP-focused regression slice**

Run: `node --test tests/ai/ai-chat-settings-skills-mcp.test.mjs`

Expected: PASS with the settings drawer still exposing the MCP tab, the page still owning CRUD hooks, and the old hero-specific structure removed.

### Task 5: Finish States, Responsive Behavior, And Verification

**Files:**
- Modify: `src/components/workspace/AIChat.css`
- Modify as needed based on verification feedback

- [ ] **Step 1: Add explicit state styling for rows, panes, empty states, loading states, and error feedback**

```css
.chat-settings-source-row:hover,
.chat-settings-provider-item:hover,
.chat-settings-mcp-server-item:hover {
  background: color-mix(in srgb, var(--workbench-role-accent, #3b82f6) 8%, var(--desktop-shell-surface-strong, #1d242f));
}

.chat-settings-source-row.active,
.chat-settings-provider-item.active,
.chat-settings-mcp-server-item.active {
  border-color: color-mix(in srgb, var(--workbench-role-accent, #3b82f6) 34%, var(--desktop-shell-border, rgba(255, 255, 255, 0.08)));
}

.chat-settings-empty-panel,
.chat-settings-mcp-empty {
  padding: 14px;
  border-radius: 12px;
}
```

- [ ] **Step 2: Make mobile collapse predictable by preserving one dominant stage and demoting companion content below it**

Run: `node --test tests/ai/ai-chat-settings-skills-mcp.test.mjs`

Expected: PASS, with CSS still preserving scroll behavior and without reintroducing stacked overflowing cards.

- [ ] **Step 3: Run the full targeted verification slice**

Run: `node --test tests/ai/ai-chat-settings-workbench-ui.test.mjs tests/ai/ai-chat-settings-skills-mcp.test.mjs tests/ai/ai-chat-ai-settings-tab-lazy-loading.test.mjs tests/ai/ai-chat-settings-state-hook-boundary.test.mjs`

Expected: PASS

- [ ] **Step 4: Run a final build check**

Run: `npm run build`

Expected: PASS

- [ ] **Step 5: Refresh the graph after the implementation lands**

Run: `graphify update .`

Expected: Graph updated successfully with the new settings-page structure reflected in `graphify-out/`.
