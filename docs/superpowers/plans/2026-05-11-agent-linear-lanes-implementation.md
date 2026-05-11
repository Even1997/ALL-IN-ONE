# Agent Linear Lanes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the assistant timeline, thinking lane, and answer lane share a narrower linear log-style surface that stays readable in the sidebar and matches the provided reference more closely.

**Architecture:** Keep the runtime/message data flow unchanged and confine the work to assistant presentation components plus CSS contracts. The implementation should unify `TimelineCard`, `AssistantThinkingBlock`, and `AssistantTextBlock` under one lighter lane language, while preserving existing collapse behavior, Markdown rendering, and detail drawers.

**Tech Stack:** React, TypeScript, CSS, Node test runner

---

### Task 1: Lock the new linear-lane UI contract in source tests

**Files:**
- Modify: `tests/ai/ai-chat-runtime-output-flow.test.mjs`
- Modify: `tests/ai/ai-chat-timeline-view.test.mjs`

- [ ] **Step 1: Expand the timeline structure regression to keep the single-line row contract**

```js
test('timeline cards render as compact log rows with inline summary and lightweight actions', async () => {
  const source = await readFile('src/components/workspace/timeline/TimelineCard.tsx', 'utf8');

  assert.match(source, /className="chat-timeline-card-main"/);
  assert.match(source, /className="chat-timeline-card-summary-inline"/);
  assert.match(source, /className="chat-timeline-card-actions"/);
  assert.doesNotMatch(source, /className="chat-timeline-card-chip"/);
});
```

- [ ] **Step 2: Update the shared surface-language test to expect lighter thinking and answer lanes**

```js
assert.match(
  cssSource,
  /\.chat-answer-text\s*\{[\s\S]*padding:\s*8px 0 8px 14px[\s\S]*border:\s*0[\s\S]*border-radius:\s*0[\s\S]*box-shadow:\s*none/
);
assert.match(
  cssSource,
  /\.chat-thinking-block\s*\{[\s\S]*padding:\s*6px 0 6px 14px[\s\S]*border:\s*0[\s\S]*border-radius:\s*0[\s\S]*box-shadow:\s*none/
);
assert.match(
  cssSource,
  /\.chat-thinking-block::before,\s*\r?\n\.chat-answer-text::before,\s*\r?\n\.chat-timeline-card::before\s*\{[\s\S]*width:\s*2px/
);
```

- [ ] **Step 3: Tighten the typography-scale regression around compact sidebar-safe copy**

```js
assert.match(
  cssSource,
  /\.gn-agent-workspace \.chat-shell-embedded \.chat-message\.assistant \.chat-message-content\s*\{[\s\S]*font-size:\s*13px/
);
assert.match(
  cssSource,
  /\.chat-thinking-copy strong\s*\{[\s\S]*font-size:\s*12px/
);
```

- [ ] **Step 4: Run the targeted tests first to confirm the current implementation fails the new contract**

Run: `node --test --test-name-pattern "assistant narrative, thinking, and runtime cards share a unified surface language|assistant narrative and runtime cards use a consistent typography scale|timeline cards render as compact log rows with inline summary and lightweight actions" tests/ai/ai-chat-runtime-output-flow.test.mjs tests/ai/ai-chat-timeline-view.test.mjs`

Expected: FAIL because thinking and answer blocks still use heavier card surfaces and wider typography/spacing.

### Task 2: Convert the thinking block into a linear expandable lane

**Files:**
- Modify: `src/components/workspace/AIChatAssistantParts.tsx`
- Modify: `src/components/workspace/AIChat.css`
- Test: `tests/ai/ai-chat-runtime-output-flow.test.mjs`

- [ ] **Step 1: Keep the thinking block markup contract simple and lane-oriented**

```tsx
<div className={`chat-thinking-block ${isExpanded ? 'expanded' : 'collapsed'}`}>
  <button
    type="button"
    className="chat-thinking-toggle"
    onClick={onToggleThinking}
    disabled={!onToggleThinking}
    aria-expanded={isExpanded}
  >
    <span className="chat-thinking-pulse" aria-hidden="true" />
    <span className="chat-thinking-copy">
      <strong>{summaryLabel}{durationLabel ? ` ${durationLabel}` : ''}</strong>
      {summaryPreview ? <span className="chat-thinking-preview">{summaryPreview}</span> : null}
    </span>
    {isThinkingActive ? <span className="chat-thinking-dots" aria-hidden="true"><span /><span /><span /></span> : null}
    <span className="chat-thinking-toggle-caret" aria-hidden="true" />
  </button>
  <div className="chat-thinking-block-content">
    <div>{part.content ? <pre>{part.content}</pre> : <div className="chat-thinking-empty">等待模型输出思考内容...</div>}</div>
  </div>
</div>
```

- [ ] **Step 2: Restyle the thinking lane as a rail-led linear row instead of a glass card**

```css
.chat-thinking-block {
  position: relative;
  gap: 6px;
  padding: 6px 0 6px 14px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.chat-thinking-block::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 2px;
  border-radius: 999px;
}
```

- [ ] **Step 3: Make the expanded reasoning body read like attached detail instead of a second card**

```css
.chat-thinking-block pre,
.chat-thinking-empty {
  padding: 8px 0 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
```

- [ ] **Step 4: Run the focused runtime-output test**

Run: `node --test --test-name-pattern "assistant narrative, thinking, and runtime cards share a unified surface language|assistant narrative and runtime cards use a consistent typography scale" tests/ai/ai-chat-runtime-output-flow.test.mjs`

Expected: PASS for the thinking-lane assertions.

### Task 3: Convert the assistant answer surface into a compact narrative lane

**Files:**
- Modify: `src/components/workspace/AIChat.css`
- Test: `tests/ai/ai-chat-runtime-output-flow.test.mjs`

- [ ] **Step 1: Replace the heavy answer card shell with a narrow lane-style container**

```css
.chat-answer-text {
  position: relative;
  gap: 8px;
  padding: 8px 0 8px 14px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.chat-answer-text::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 2px;
  border-radius: 999px;
}
```

- [ ] **Step 2: Tighten assistant lane widths and typography for narrow sidebar use**

```css
.gn-agent-workspace .chat-shell-embedded .chat-message-list {
  gap: 8px;
  padding: 8px 10px 6px;
}

.gn-agent-workspace .chat-shell-embedded .chat-message.assistant .chat-message-content {
  gap: 6px;
  font-size: 13px;
  line-height: 1.62;
}
```

- [ ] **Step 3: Keep complex Markdown affordances distinct without restoring the card feel**

```css
.chat-answer-text pre,
.chat-answer-text table,
.chat-answer-text blockquote {
  margin-top: 2px;
}

.chat-answer-text pre {
  border-radius: 10px;
}
```

- [ ] **Step 4: Run the typography-and-surface regression again**

Run: `node --test --test-name-pattern "assistant narrative, thinking, and runtime cards share a unified surface language|assistant narrative and runtime cards use a consistent typography scale" tests/ai/ai-chat-runtime-output-flow.test.mjs`

Expected: PASS for answer-lane assertions.

### Task 4: Finish the timeline lane so it matches the same sidebar-safe system

**Files:**
- Modify: `src/components/workspace/timeline/TimelineCard.tsx`
- Modify: `src/components/workspace/AIChat.css`
- Test: `tests/ai/ai-chat-timeline-view.test.mjs`
- Test: `tests/ai/ai-chat-runtime-output-flow.test.mjs`

- [ ] **Step 1: Preserve the existing inline row markup and only adjust if needed for consistency**

```tsx
<section className={`chat-timeline-card ${card.status}`}>
  <header className="chat-timeline-card-head">
    <div className="chat-timeline-card-main">
      <span className="chat-timeline-card-phase">{PHASE_LABELS[card.phase]}</span>
      <div className="chat-timeline-card-copy">
        <strong>{card.title}</strong>
        {card.progressLabel ? <><span aria-hidden="true" className="chat-timeline-card-divider">/</span><span className="chat-timeline-card-progress">{card.progressLabel}</span></> : null}
        <span className="chat-timeline-card-summary-inline">{card.summary}</span>
      </div>
    </div>
    <div className="chat-timeline-card-actions">{/* status + details */}</div>
  </header>
</section>
```

- [ ] **Step 2: Reduce remaining wash, gaps, and metadata weight so the timeline aligns with thinking/body lanes**

```css
.chat-timeline-view {
  gap: 4px;
}

.chat-timeline-card-head {
  gap: 8px;
}

.chat-timeline-card-main,
.chat-timeline-card-copy {
  gap: 4px;
}
```

- [ ] **Step 3: Run the timeline-focused tests**

Run: `node --test --test-name-pattern "timeline cards render as compact log rows with inline summary and lightweight actions|assistant narrative, thinking, and runtime cards share a unified surface language" tests/ai/ai-chat-timeline-view.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs`

Expected: PASS

### Task 5: Run focused verification and refresh the graph

**Files:**
- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`
- Modify: `graphify-out/manifest.json`

- [ ] **Step 1: Run the focused assistant/timeline regression suite**

Run: `node --test tests/ai/ai-chat-timeline-view.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs tests/ai/chat-timeline-bubble-cards.test.mjs`

Expected: PASS

- [ ] **Step 2: Review the intended UI diff**

Run: `git diff -- src/components/workspace/AIChatAssistantParts.tsx src/components/workspace/timeline/TimelineCard.tsx src/components/workspace/AIChat.css tests/ai/ai-chat-timeline-view.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs docs/superpowers/specs/2026-05-11-agent-linear-lanes-design.zh-CN.md docs/superpowers/plans/2026-05-11-agent-linear-lanes-implementation.md`

Expected: Diff shows only the lane-unification changes plus the new spec/plan docs.

- [ ] **Step 3: Refresh graphify output after implementation**

Run: `graphify update .`

Expected: Graph update completes successfully and refreshes `graphify-out/` metadata.
