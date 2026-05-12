# AI Chat Final Answer Process Fold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Final answer` mean the final assistant body only, render it exactly once, and collapse prior thinking/tool/runtime process into one optional fold when process artifacts exist.

**Architecture:** Preserve provider adapters, canonical runtime events, timeline composer truth, and persisted conversation facts. Implement the behavior in the presentation path only: `timeline projection -> assistant render model -> message item composition -> fold UI`. The UI may derive a process fold header from runtime cards, but it must not rewrite runtime truth just to improve display.

**Tech Stack:** React, TypeScript, Zustand, Node test runner (`node --test`), graphify

---

## Target Behavior

- `Final answer` is the final assistant body shown to the user.
- The final assistant body renders once only.
- `thinking`, `tool`, `approval`, `question`, and compact completion summary belong to process UI, not the final body.
- When there are no process artifacts, the assistant message stays a normal message with no extra fold shell.
- When there are process artifacts, the UI shows one fold above the final body.
- The fold is expanded while work is active and auto-collapses after completion.
- A completed `response` card must not re-render the final body as a second visible block.

## Current Problems To Remove

- `Final answer` still competes with completed `response` cards for visible space, so the UI can look like the body is shown twice in two different forms.
- `GNAgentMessageItem.tsx` currently knows how to sort timeline items, but it does not yet model a distinct `process fold` versus `final body` presentation contract.
- `chatTimelineBubbleCardModel.ts` still returns completed response descriptors as regular visible bubble cards, which is correct as runtime metadata but wrong as final chat presentation.
- The current composition path can collapse `thinking` per block, but not the whole pre-answer process as one unit.
- The no-tool case still needs an explicit guard so plain assistant replies do not gain an unnecessary fold shell.

## Delete / Replace Plan

- Delete the independent visible rendering of completed `response` timeline cards from the assistant bubble path.
- Replace completed `response` bubble rendering with fold-header metadata: one-line summary, completed time, and completion state.
- Replace the current "everything sorted into one visible stream" assumption with a two-zone presentation contract:
  - process zone
  - final answer zone
- Keep chronological sorting inside the process zone only.
- Keep `Final answer` as one stable assistant body node with one stable key.
- Do not delete or weaken `projection.finalMessage`, `message.completed`, canonical response events, or detail drawer data.

## File Structure

- Modify: `src/components/workspace/assistantRenderModel.ts`
  Responsibility: expose one stable final answer item and classify thinking/body items for final presentation.
- Modify: `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
  Responsibility: build the visible assistant layout from `process items + final answer item + fold state`.
- Modify: `src/components/workspace/timeline/chatTimelineBubbleCardModel.ts`
  Responsibility: stop surfacing completed `response` cards as independent visible bubbles and emit completion metadata for the fold header.
- Modify: `src/components/workspace/timeline/chatTimelineBubbleCards.tsx`
  Responsibility: accept the updated descriptor shape without reopening duplicate response UI.
- Modify: `src/components/workspace/timeline/TimelineCard.tsx`
  Responsibility: keep only process-card rendering concerns; do not become a second final-answer surface.
- Modify: `src/components/workspace/AIChat.css`
  Responsibility: style the process fold, compact completed header, and no-tool fallback layout.
- Modify: `tests/ai/assistant-render-model.test.mjs`
  Responsibility: lock the rule that final answer is one final body item only.
- Modify: `tests/ai/gn-agent-message-item.test.mjs`
  Responsibility: lock the rule that process items fold separately from the final answer.
- Modify: `tests/ai/ai-chat-timeline-view.test.mjs`
  Responsibility: lock the rule that completed response summaries do not appear as duplicate visible bubbles.
- Modify: `tests/ai/gn-agent-message-flow-source.test.mjs`
  Responsibility: source assertions for the new process-fold contract.

---

### Task 1: Lock The New Render Contract In Tests

**Files:**
- Modify: `tests/ai/assistant-render-model.test.mjs`
- Modify: `tests/ai/gn-agent-message-item.test.mjs`
- Modify: `tests/ai/ai-chat-timeline-view.test.mjs`
- Modify: `tests/ai/gn-agent-message-flow-source.test.mjs`

- [ ] **Step 1: Add a render-model test for one final answer body only**
- [ ] **Step 2: Add a message-item test for `process fold + final answer` layout when tool/runtime artifacts exist**
- [ ] **Step 3: Add a no-tool test that keeps plain assistant replies out of the fold shell**
- [ ] **Step 4: Add a timeline-view test that completed `response` cards no longer return independent visible bubble descriptors**
- [ ] **Step 5: Run the focused tests and confirm they fail before implementation**

Run:

```bash
node --test tests/ai/assistant-render-model.test.mjs tests/ai/gn-agent-message-item.test.mjs tests/ai/ai-chat-timeline-view.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs
```

Expected: FAIL because the current code still treats completed response UI and final body as separate visible surfaces.

### Task 2: Make The Assistant Render Model Expose One Final Body

**Files:**
- Modify: `src/components/workspace/assistantRenderModel.ts`
- Test: `tests/ai/assistant-render-model.test.mjs`

- [ ] **Step 1: Keep one stable answer item key across streaming and completion**
- [ ] **Step 2: Keep `thinking` items separate from the final answer item**
- [ ] **Step 3: Add a derived flag or structure that tells the caller whether a final answer body exists**
- [ ] **Step 4: Ensure the model never emits two visible answer items for one assistant message**
- [ ] **Step 5: Run `tests/ai/assistant-render-model.test.mjs` and make it pass**

Run:

```bash
node --test tests/ai/assistant-render-model.test.mjs
```

Expected: PASS.

### Task 3: Convert Completed Response Cards Into Fold Metadata

**Files:**
- Modify: `src/components/workspace/timeline/chatTimelineBubbleCardModel.ts`
- Modify: `src/components/workspace/timeline/chatTimelineBubbleCards.tsx`
- Modify: `src/components/workspace/timeline/TimelineCard.tsx`
- Test: `tests/ai/ai-chat-timeline-view.test.mjs`

- [ ] **Step 1: Split timeline-card output into**
  - visible process bubble descriptors
  - completed response summary metadata for the fold header
- [ ] **Step 2: Stop returning completed `response` descriptors as independent visible bubbles**
- [ ] **Step 3: Preserve detail data and completion timestamps for the fold header**
- [ ] **Step 4: Keep non-response runtime cards unchanged**
- [ ] **Step 5: Run `tests/ai/ai-chat-timeline-view.test.mjs` and make it pass**

Run:

```bash
node --test tests/ai/ai-chat-timeline-view.test.mjs
```

Expected: PASS.

### Task 4: Compose Assistant Messages As Process Fold Plus Final Body

**Files:**
- Modify: `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
- Modify: `src/components/workspace/AIChat.css`
- Test: `tests/ai/gn-agent-message-item.test.mjs`
- Test: `tests/ai/gn-agent-message-flow-source.test.mjs`

- [ ] **Step 1: Derive three presentation buckets in `GNAgentMessageItem.tsx`**
  - process render items
  - final answer render item
  - fold header metadata
- [ ] **Step 2: Show the process fold only when real process artifacts exist**
- [ ] **Step 3: Keep the process fold expanded during streaming or running states**
- [ ] **Step 4: Auto-collapse the process fold after completion while keeping manual reopen available**
- [ ] **Step 5: Render the final answer body once below the fold**
- [ ] **Step 6: Keep the no-tool path as a plain assistant message with no extra fold container**
- [ ] **Step 7: Add CSS for fold summary, completed time, compact summary, and spacing between fold and final body**
- [ ] **Step 8: Run the message-item tests and make them pass**

Run:

```bash
node --test tests/ai/gn-agent-message-item.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs
```

Expected: PASS.

### Task 5: Regression Verification And Graph Refresh

**Files:**
- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`
- Modify: `graphify-out/manifest.json`

- [ ] **Step 1: Run the focused AI chat tests**
- [ ] **Step 2: Run the broader chat/runtime regression tests**
- [ ] **Step 3: Run the production build**
- [ ] **Step 4: Run `git diff --check`**
- [ ] **Step 5: Run `graphify update .`**

Run:

```bash
node --test tests/ai/assistant-render-model.test.mjs tests/ai/gn-agent-message-item.test.mjs tests/ai/ai-chat-timeline-view.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs
npm run build
git diff --check
graphify update .
```

Expected:

- Target tests PASS
- Build PASS
- `git diff --check` reports no whitespace errors
- `graphify update .` refreshes graph artifacts successfully

## Notes For Execution

- Do not patch this by changing provider adapters, canonical event mapping, or timeline composer semantics.
- `projection.finalMessage` remains the source of truth for completion text; this plan only changes whether completed response metadata becomes a visible bubble or a fold summary.
- If a source test currently encodes the old visible `response` bubble behavior, replace it rather than weakening the new contract.
