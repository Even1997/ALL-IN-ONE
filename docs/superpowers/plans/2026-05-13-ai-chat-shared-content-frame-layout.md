# AI Chat Shared Content Frame Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce one shared content frame in the embedded GN agent chat so user input, thinking, tool execution, and final answer all obey the same width boundary as the composer.

**Architecture:** Keep the fix in the UI composition layer. `GNAgentMessageItem.tsx` owns the structural wrapper, and `AIChat.css` makes that wrapper the single width authority for embedded GN-agent content. Child lanes stop deciding independent widths wherever the frame can own them instead.

**Tech Stack:** TypeScript, React, CSS, Node test runner

---

### Task 1: Add A Shared Message Content Frame

**Files:**
- Modify: `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
- Test: `tests/ai/gn-agent-message-item.test.mjs`

- [ ] **Step 1: Write the failing source assertion**

```js
assert.match(messageItemSource, /className="chat-message-content-frame chat-message-content-frame-assistant"/);
assert.match(messageItemSource, /className="chat-message-content-frame chat-message-content-frame-user"/);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/ai/gn-agent-message-item.test.mjs`
Expected: FAIL because the shared frame class does not exist yet.

- [ ] **Step 3: Wrap assistant and user content in the shared frame**

```tsx
<div className="chat-message-content-frame chat-message-content-frame-assistant">
  <div className="chat-message-process-inline">...</div>
  <AssistantMessageActionBar ... />
  <div className="chat-message-meta">{formatTimestamp(message.createdAt)}</div>
</div>
```

```tsx
<div className="chat-message-content-frame chat-message-content-frame-user">
  <div className="chat-message-bubble">...</div>
</div>
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test tests/ai/gn-agent-message-item.test.mjs`
Expected: PASS

### Task 2: Move Width Ownership To The Frame

**Files:**
- Modify: `src/components/workspace/AIChat.css`
- Test: `tests/ai/agent-workbench-layout.test.mjs`
- Test: `tests/ai/ai-chat-runtime-output-flow.test.mjs`

- [ ] **Step 1: Write failing layout assertions for the frame-owned width**

```js
assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-message-content-frame\s*\{[\s\S]*?width:\s*var\(--gn-agent-linear-lane-width\);[\s\S]*?margin-inline:\s*auto;/);
assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-message-content-frame-user\s*\{[\s\S]*?align-items:\s*flex-end;/);
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `node --test tests/ai/agent-workbench-layout.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs`
Expected: FAIL because the frame CSS is missing.

- [ ] **Step 3: Make the frame the single embedded width boundary**

```css
.gn-agent-workspace .chat-shell-embedded .chat-message-content-frame {
  width: var(--gn-agent-linear-lane-width);
  max-width: 100%;
  min-width: 0;
  margin-inline: auto;
  box-sizing: border-box;
}
```

```css
.gn-agent-workspace .chat-shell-embedded .chat-message-content-frame-user {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
```

- [ ] **Step 4: Convert assistant/tool/final child widths to frame-relative sizing**

```css
.gn-agent-workspace .chat-shell-embedded .chat-message-process-inline,
.gn-agent-workspace .chat-shell-embedded .chat-message-final-answer,
.gn-agent-workspace .chat-shell-embedded .chat-message-thinking-lane,
.gn-agent-workspace .chat-shell-embedded .chat-message-card-lane,
.gn-agent-workspace .chat-shell-embedded .chat-tool-trace-stream {
  width: 100%;
  max-width: 100%;
}
```

- [ ] **Step 5: Keep long tool summary text and user bubbles from escaping the frame**

```css
.gn-agent-workspace .chat-shell-embedded .chat-message-content-frame .chat-message-bubble,
.gn-agent-workspace .chat-shell-embedded .chat-message-content-frame .chat-tool-card,
.gn-agent-workspace .chat-shell-embedded .chat-message-content-frame .chat-tool-trace-card-inline {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
```

- [ ] **Step 6: Run the focused layout tests**

Run: `node --test tests/ai/agent-workbench-layout.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs`
Expected: PASS

### Task 3: Run Regression Verification And Refresh The Graph

**Files:**
- Modify: `tests/ai/agent-workbench-layout.test.mjs`
- Modify: `tests/ai/gn-agent-message-item.test.mjs`

- [ ] **Step 1: Run the targeted regression suite**

Run: `node --test tests/ai/gn-agent-message-item.test.mjs tests/ai/agent-workbench-layout.test.mjs tests/ai/assistant-message-output-model.test.mjs tests/ai/assistant-render-model.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs`
Expected: PASS

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Refresh graphify**

Run: `graphify update .`
Expected: graph refresh completes; existing warnings are noted if unchanged.
