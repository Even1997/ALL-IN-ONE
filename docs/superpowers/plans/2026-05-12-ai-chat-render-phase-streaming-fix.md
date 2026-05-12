# AI Chat Render-Phase Streaming Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate render-triggered mutation of old assistant messages, make running/final assistant text come from one stable source path, and keep paragraph-style streaming without making process playback diverge from the final result.

**Architecture:** Keep provider adapters, canonical runtime events, timeline composer, and persisted session truth unchanged. Fix this in the presentation layer by removing render-phase side effects from `AIChat.tsx`, introducing a deterministic UI draft projection step, and making `GNAgentMessageItem` consume one stable assistant message draft model for both running and completed states.

**Tech Stack:** React, TypeScript, Zustand, Node test runner (`node --test`), graphify

---

## Root Cause Summary

- `src/components/workspace/AIChat.tsx` currently computes `effectiveDraftContents` inside `useMemo`, but that calculation also mutates refs, advances paragraph streaming state, clears/reschedules timeouts, and depends on `Date.now()`.
- Because that work happens during render, any unrelated rerender can change already-finished or nearly-finished assistant output. This matches the user-visible bug where asking the next question changes the previous answer.
- Running assistant text and completed assistant text still have different handoff behavior:
  - running path reads `projection.activeMessage.text`
  - completion handoff may read `projection.finalMessage.text`
  - stable stored message content comes from `message.timeline`
- That source split is why refresh/replay can show a different process path than the eventual final answer, even after the timeline ordering work was already fixed.

## Delete / Replace Plan

- Delete render-phase paragraph streaming state advancement from `AIChat.tsx` inside `effectiveDraftContents`.
- Delete render-phase timeout scheduling/clearing that is coupled to `useMemo` recomputation.
- Replace the current ad hoc draft derivation with a deterministic helper that takes:
  - stored assistant message
  - timeline projection
  - previous UI paragraph buffer state
  - current clock value from an effect/timer boundary, not render
- Keep `assistantParagraphStreaming.ts` as the paragraph flush state machine, but only drive it from controlled state transitions.
- Keep the unified timeline render model introduced in `chatMessageTimelineRenderModel.ts`; do not reintroduce local process/result ordering.

## File Structure

- Modify: `src/components/workspace/AIChat.tsx`
  Responsibility: remove render-phase side effects, move streaming draft progression into effect-driven state updates, and ensure completed messages stop mutating on unrelated rerenders.
- Add: `src/components/workspace/assistantStreamingDraftProjection.ts`
  Responsibility: pure helper that derives the next visible assistant draft state from stored timeline + projection + current buffered UI state.
- Modify: `src/components/workspace/assistantParagraphStreaming.ts`
  Responsibility: support deterministic step/flush/finalize semantics without requiring render-time mutation.
- Modify: `src/components/workspace/assistantRenderModel.ts`
  Responsibility: continue consuming one visible assistant text source, but make the completed handoff explicit and stable.
- Modify: `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
  Responsibility: keep process/final display on the same source model and avoid any fallback that can re-show or re-derive stale content differently after completion.
- Modify: `tests/ai/assistant-render-model.test.mjs`
  Responsibility: verify completed assistant content is stable and not re-derived from a different source after completion.
- Add or modify: `tests/ai/ai-chat-timeline-view.test.mjs`
  Responsibility: verify running and final display use the same source chain rather than divergent rendering logic.
- Add: `tests/ai/assistant-streaming-draft-projection.test.mjs`
  Responsibility: lock the regression around unrelated rerenders changing prior assistant output.

---

### Task 1: Lock the Regressions With Failing Tests

**Files:**
- Add: `tests/ai/assistant-streaming-draft-projection.test.mjs`
- Modify: `tests/ai/assistant-render-model.test.mjs`
- Modify: `tests/ai/ai-chat-timeline-view.test.mjs`

- [ ] Add a test that reproduces the core bug: given the same stored message, same projection, and no new stream data, recomputing the UI draft twice must not advance visible text or mutate prior output.
- [ ] Add a test that models completion handoff: once `finalMessage.text` is available and the message is marked non-streaming, the visible final answer must remain stable across later recomputations.
- [ ] Add a source-level assertion that the final chat view no longer performs paragraph-streaming mutation inside `useMemo`.
- [ ] Run:

```bash
node --test tests/ai/assistant-streaming-draft-projection.test.mjs tests/ai/assistant-render-model.test.mjs tests/ai/ai-chat-timeline-view.test.mjs
```

Expected: FAIL before production changes.

### Task 2: Extract a Pure Assistant Draft Projection Layer

**Files:**
- Add: `src/components/workspace/assistantStreamingDraftProjection.ts`
- Modify: `src/components/workspace/assistantParagraphStreaming.ts`
- Test: `tests/ai/assistant-streaming-draft-projection.test.mjs`

- [ ] Add a pure helper that accepts the current assistant message, its `TimelineProjection | null`, and previous UI paragraph buffer state, and returns the next visible draft model without mutating refs.
- [ ] Keep separate handling for:
  - reasoning streaming visibility
  - answer streaming visibility
  - completion handoff to final answer
- [ ] Ensure the helper can distinguish:
  - new raw text arrived
  - timeout-based forced flush
  - no source change, so visible output must stay identical
- [ ] Run:

```bash
node --test tests/ai/assistant-streaming-draft-projection.test.mjs
```

Expected: PASS.

### Task 3: Remove Render-Phase Mutation From `AIChat.tsx`

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Test: `tests/ai/assistant-streaming-draft-projection.test.mjs`
- Test: `tests/ai/ai-chat-timeline-view.test.mjs`

- [ ] Replace the current `effectiveDraftContents` `useMemo` side-effect flow with state/effect-driven updates that only run when assistant source data actually changes.
- [ ] Move paragraph timeout scheduling so it is triggered by controlled state transitions, not by arbitrary render passes.
- [ ] Prune or freeze completed message draft state so starting a new question cannot continue advancing or rewriting the previous answer.
- [ ] Preserve the paragraph-style effect for active messages, but stop replaying or re-advancing old completed messages during ordinary rerenders.
- [ ] Run:

```bash
node --test tests/ai/assistant-streaming-draft-projection.test.mjs tests/ai/ai-chat-timeline-view.test.mjs
```

Expected: PASS.

### Task 4: Stabilize Running/Final Assistant Source Handoff

**Files:**
- Modify: `src/components/workspace/assistantRenderModel.ts`
- Modify: `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
- Modify: `src/components/workspace/AIChat.tsx`
- Test: `tests/ai/assistant-render-model.test.mjs`
- Test: `tests/ai/gn-agent-message-item.test.mjs`

- [ ] Make the visible assistant answer path explicit:
  - running state uses the active visible draft text
  - completed state uses the finalized visible draft text once
  - stored `message.timeline` remains the semantic truth, but the UI must not visibly jump between two incompatible text sources
- [ ] Keep the final answer rendered once only, with the completed fold still outside the final正文.
- [ ] Keep the process/result timeline ordering on the shared timeline model added previously.
- [ ] Run:

```bash
node --test tests/ai/assistant-render-model.test.mjs tests/ai/gn-agent-message-item.test.mjs tests/ai/assistant-streaming-draft-projection.test.mjs tests/ai/ai-chat-timeline-view.test.mjs
```

Expected: PASS.

### Task 5: Full Verification and Graph Refresh

**Files:**
- Modify: `graphify-out/*` via tool update

- [ ] Run the focused AI chat test set:

```bash
node --test tests/ai/assistant-render-model.test.mjs tests/ai/ai-chat-timeline-view.test.mjs tests/ai/gn-agent-message-item.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs tests/ai/message-timeline-ordering.test.mjs tests/ai/assistant-streaming-draft-projection.test.mjs
```

- [ ] Run:

```bash
npm run build
```

- [ ] Run:

```bash
git diff --check
```

- [ ] Run:

```bash
graphify update .
```

- [ ] Manually verify these UI cases:
  - active answer streams paragraph-by-paragraph without old messages changing when typing the next prompt
  - refresh during streaming does not invent a different process playback order
  - completed fold shows only `已处理 X 秒`
  - final answer renders once only

## Expected Outcome

- Asking the next question no longer changes the previous assistant answer or process display.
- Running assistant text and final assistant text come from one stable UI draft chain instead of diverging during completion.
- Paragraph streaming remains, but it is driven only by real stream/projection changes rather than arbitrary rerenders.
- The previously fixed unified timeline ordering stays intact.
