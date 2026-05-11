# Agent Timeline Log Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make collapsed AI timeline cards read like linear runtime log rows that match the provided reference more closely while keeping the existing detail drawer behavior.

**Architecture:** Keep the runtime timeline data model unchanged and limit the work to the collapsed card renderer, its CSS surface language, and source-level regression tests. The implementation should remove the remaining chip/card treatment, introduce a left-side linear rail plus inline separators, and preserve the existing expand/collapse contract.

**Tech Stack:** React, TypeScript, CSS, Node test runner

---

### Task 1: Lock the intended linear-row contract in tests

**Files:**
- Modify: `tests/ai/ai-chat-timeline-view.test.mjs`
- Modify: `tests/ai/ai-chat-runtime-output-flow.test.mjs`

- [ ] **Step 1: Update the timeline structure regression test**

```js
test('timeline cards render as compact log rows with inline summary and lightweight actions', async () => {
  const source = await readFile('src/components/workspace/timeline/TimelineCard.tsx', 'utf8');

  assert.match(source, /className="chat-timeline-card-main"/);
  assert.match(source, /className="chat-timeline-card-meta"/);
  assert.match(source, /className="chat-timeline-card-summary-inline"/);
  assert.match(source, /className="chat-timeline-card-divider"/);
  assert.doesNotMatch(source, /className="chat-timeline-card-chip"/);
});
```

- [ ] **Step 2: Run the targeted test to verify it fails before implementation**

Run: `node --test --test-name-pattern "timeline cards render as compact log rows with inline summary and lightweight actions" tests/ai/ai-chat-timeline-view.test.mjs`

Expected: FAIL because `TimelineCard.tsx` does not yet contain the divider-based inline structure.

- [ ] **Step 3: Update the CSS contract test for the tighter log-row surface**

```js
assert.match(
  cssSource,
  /\.chat-timeline-card\s*\{[\s\S]*padding:\s*5px 0 5px 14px[\s\S]*border:\s*0[\s\S]*border-radius:\s*0[\s\S]*box-shadow:\s*none/
);
assert.match(
  cssSource,
  /\.chat-timeline-card::before\s*\{[\s\S]*width:\s*2px[\s\S]*border-radius:\s*999px/
);
```

- [ ] **Step 4: Run the CSS regression test to verify it fails**

Run: `node --test --test-name-pattern "assistant narrative, thinking, and runtime cards share a unified surface language" tests/ai/ai-chat-runtime-output-flow.test.mjs`

Expected: FAIL because the CSS still uses a card shell instead of a rail-style linear row.

### Task 2: Convert the collapsed renderer to a linear log-row structure

**Files:**
- Modify: `src/components/workspace/timeline/TimelineCard.tsx`
- Test: `tests/ai/ai-chat-timeline-view.test.mjs`

- [ ] **Step 1: Replace the collapsed card markup with a log-row layout**

```tsx
<header className="chat-timeline-card-head">
  <div className="chat-timeline-card-main">
    <span className="chat-timeline-card-phase">{PHASE_LABELS[card.phase]}</span>
    <div className="chat-timeline-card-copy">
      <strong>{card.title}</strong>
      {card.progressLabel ? (
        <>
          <span aria-hidden="true" className="chat-timeline-card-divider">/</span>
          <span className="chat-timeline-card-progress">{card.progressLabel}</span>
        </>
      ) : null}
      <span className="chat-timeline-card-summary-inline">{card.summary}</span>
      {card.toolCount > 0 ? (
        <>
          <span aria-hidden="true" className="chat-timeline-card-divider">·</span>
          <span className="chat-timeline-card-meta">{card.toolCount} 个工具</span>
        </>
      ) : null}
    </div>
  </div>
  <div className="chat-timeline-card-actions">
    <span className={`chat-timeline-card-status ${card.status}`}>{STATUS_LABELS[card.status]}</span>
    {card.detailRefs.length > 0 ? (
      <>
        <span aria-hidden="true" className="chat-timeline-card-divider">·</span>
        <button type="button" className="chat-timeline-card-toggle" onClick={onToggleDetails}>
          {detailsOpen ? '收起' : '详情'}
        </button>
      </>
    ) : null}
  </div>
</header>
```

- [ ] **Step 2: Keep the existing behavior contract intact**

```tsx
export const TimelineCard: React.FC<{
  card: TimelineCardModel;
  onToggleDetails: () => void;
  detailsOpen: boolean;
}> = ({ card, onToggleDetails, detailsOpen }) => {
  return (
    <section className={`chat-timeline-card ${card.status}`}>
      {/* updated collapsed row layout only */}
    </section>
  );
};
```

- [ ] **Step 3: Run the structure regression test**

Run: `node --test --test-name-pattern "timeline cards render as compact log rows with inline summary and lightweight actions" tests/ai/ai-chat-timeline-view.test.mjs`

Expected: PASS

### Task 3: Restyle the card from chip panel to linear log row

**Files:**
- Modify: `src/components/workspace/AIChat.css`
- Test: `tests/ai/ai-chat-runtime-output-flow.test.mjs`

- [ ] **Step 1: Tighten the card shell and add row-specific layout classes**

```css
.chat-timeline-card {
  padding: 5px 0 5px 14px;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.chat-timeline-card::before {
  width: 2px;
  border-radius: 999px;
}
```

- [ ] **Step 2: Reduce chip weight and make the right side read like metadata**

```css
.chat-timeline-card-phase,
.chat-timeline-card-progress {
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 10px;
}

.chat-timeline-card-status {
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 10px;
}

.chat-timeline-card-toggle {
  font-size: 10px;
  opacity: 0.74;
}
```

- [ ] **Step 3: Ensure long summaries truncate in one line without breaking the row**

```css
.chat-timeline-card-copy,
.chat-timeline-card-summary-inline {
  min-width: 0;
}

.chat-timeline-card-summary-inline {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 4: Run the CSS regression test**

Run: `node --test --test-name-pattern "assistant narrative, thinking, and runtime cards share a unified surface language|assistant narrative and runtime cards use a consistent typography scale" tests/ai/ai-chat-runtime-output-flow.test.mjs`

Expected: PASS

### Task 4: Run focused regressions and refresh the knowledge graph

**Files:**
- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`
- Modify: `graphify-out/manifest.json`

- [ ] **Step 1: Run the focused timeline regression suite**

Run: `node --test --test-name-pattern "timeline cards render as compact log rows with inline summary and lightweight actions|assistant narrative, thinking, and runtime cards share a unified surface language|assistant narrative and runtime cards use a consistent typography scale" tests/ai/ai-chat-timeline-view.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs`

Expected: PASS

- [ ] **Step 2: Run the existing bubble-card regression that guards timeline composition**

Run: `node --test tests/ai/chat-timeline-bubble-cards.test.mjs`

Expected: PASS

- [ ] **Step 3: Refresh graphify output after code changes**

Run: `graphify update .`

Expected: Graph update completes without API calls and refreshes `graphify-out/` metadata.

- [ ] **Step 4: Review changed files before handoff**

Run: `git diff -- src/components/workspace/timeline/TimelineCard.tsx src/components/workspace/AIChat.css tests/ai/ai-chat-timeline-view.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs docs/superpowers/specs/2026-05-11-agent-timeline-log-row-design.zh-CN.md docs/superpowers/plans/2026-05-11-agent-timeline-log-row-implementation.md`

Expected: Diff shows only the intended log-row UI, test, and design/plan changes.
