# AI Chat Block Streaming Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current paragraph-reveal assistant streaming path with a single block-based streaming source so running output and completed output render from the same timeline truth.

**Architecture:** Keep the existing runtime and canonical timeline layers unchanged. Move the assistant UI from `paragraphStreamingState` buffering to direct block projection in the `projection -> draft projection -> assistant render model -> GN agent message item` chain, and remove the extra paragraph flush scheduler that currently causes divergence between in-progress and completed views.

**Tech Stack:** React, TypeScript, node:test, graphify

---

## File Structure

**Modify**
- `src/components/workspace/AIChat.tsx`
- `src/components/workspace/assistantStreamingDraftProjection.ts`
- `src/components/workspace/assistantRenderModel.ts`
- `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
- `tests/ai/ai-chat-paragraph-streaming-source.test.mjs`
- `tests/ai/ai-chat-thinking-paragraph-streaming-source.test.mjs`
- `tests/ai/assistant-streaming-draft-projection.test.mjs`
- `tests/ai/assistant-render-model.test.mjs`

**Delete**
- `src/components/workspace/assistantParagraphStreaming.ts`
- `tests/ai/assistant-paragraph-streaming.test.mjs`

**Verify**
- `tests/ai/gn-agent-message-item.test.mjs`
- `tests/ai/ai-chat-timeline-view.test.mjs`
- `tests/ai/gn-agent-message-flow-source.test.mjs`

### Task 1: Lock The New Streaming Contract In Tests

**Files:**
- Modify: `tests/ai/ai-chat-paragraph-streaming-source.test.mjs`
- Modify: `tests/ai/ai-chat-thinking-paragraph-streaming-source.test.mjs`
- Modify: `tests/ai/assistant-streaming-draft-projection.test.mjs`
- Modify: `tests/ai/assistant-render-model.test.mjs`
- Delete: `tests/ai/assistant-paragraph-streaming.test.mjs`

- [ ] **Step 1: Replace source-level assertions that require paragraph buffering**

Add assertions that `AIChat.tsx` no longer imports `assistantParagraphStreaming`, no longer holds paragraph timeout refs, and still routes assistant drafts from timeline projection state.

- [ ] **Step 2: Add regression tests for block-based draft behavior**

Add tests that streaming draft projection mirrors the active response block text directly, preserves active timing metadata, and drops completed overlays once canonical timeline text catches up.

- [ ] **Step 3: Update render-model expectations**

Add tests that the assistant render model surfaces exactly one active answer block while streaming and one final answer block after completion, without depending on partial paragraph flush state.

- [ ] **Step 4: Run the targeted tests and verify they fail first**

Run:
`node --test tests/ai/ai-chat-paragraph-streaming-source.test.mjs tests/ai/ai-chat-thinking-paragraph-streaming-source.test.mjs tests/ai/assistant-streaming-draft-projection.test.mjs tests/ai/assistant-render-model.test.mjs`

Expected: failures caused by still-present paragraph streaming helpers and old draft behavior.

### Task 2: Remove Paragraph Streaming State And Switch To Block Draft Projection

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/assistantStreamingDraftProjection.ts`
- Modify: `src/components/workspace/assistantRenderModel.ts`
- Delete: `src/components/workspace/assistantParagraphStreaming.ts`

- [ ] **Step 1: Simplify assistant draft projection**

Make `projectAssistantStreamingDraft()` produce running assistant drafts directly from `projection.activeMessage.text` and reasoning event content, while preserving `streamingStartedAt` and `streamingUpdatedAt`.

- [ ] **Step 2: Remove UI paragraph timeout scheduling from `AIChat.tsx`**

Delete the answer/reasoning paragraph state refs, timeout refs, timeout schedulers, and reset helpers. Keep only one assistant draft buffer keyed by message id and derive it directly from projection recomputation.

- [ ] **Step 3: Keep completion handoff single-source**

When streaming ends, retain a completed draft only if canonical timeline text still lags behind the final projected text; otherwise clear the draft so old answers cannot mutate on the next turn.

- [ ] **Step 4: Adjust render-model semantics to block streaming**

Ensure `buildAssistantRenderModel()` treats the running answer as the visible block body, with stable keys and projection timing, and no paragraph-flush-dependent state.

- [ ] **Step 5: Run the targeted tests and make them pass**

Run:
`node --test tests/ai/ai-chat-paragraph-streaming-source.test.mjs tests/ai/ai-chat-thinking-paragraph-streaming-source.test.mjs tests/ai/assistant-streaming-draft-projection.test.mjs tests/ai/assistant-render-model.test.mjs`

Expected: all pass.

### Task 3: Verify Message Rendering Still Uses One Timeline Source

**Files:**
- Modify: `src/components/ai/gn-agent/GNAgentMessageItem.tsx` (only if contract adjustments are needed)
- Test: `tests/ai/gn-agent-message-item.test.mjs`
- Test: `tests/ai/ai-chat-timeline-view.test.mjs`
- Test: `tests/ai/gn-agent-message-flow-source.test.mjs`

- [ ] **Step 1: Confirm the GN agent message item still renders process and answer from one timeline render model**

Keep `buildChatMessageTimelineRenderModel()` as the ordering source, with process items for thinking/cards/running response and a separate final answer block only after completion.

- [ ] **Step 2: Update any source assertions that still mention paragraph streaming internals**

Only touch these tests if they still encode the removed paragraph scheduler names or helper imports.

- [ ] **Step 3: Run the message/timeline regression suite**

Run:
`node --test tests/ai/gn-agent-message-item.test.mjs tests/ai/ai-chat-timeline-view.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs`

Expected: all pass.

### Task 4: Full Verification And Graph Refresh

**Files:**
- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`
- Modify: `graphify-out/manifest.json`

- [ ] **Step 1: Run the focused AI chat regression suite**

Run:
`node --test tests/ai/ai-chat-paragraph-streaming-source.test.mjs tests/ai/ai-chat-thinking-paragraph-streaming-source.test.mjs tests/ai/assistant-streaming-draft-projection.test.mjs tests/ai/assistant-render-model.test.mjs tests/ai/gn-agent-message-item.test.mjs tests/ai/ai-chat-timeline-view.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs`

- [ ] **Step 2: Run build verification**

Run:
`npm run build`

- [ ] **Step 3: Run diff sanity checks**

Run:
`git diff --check`

- [ ] **Step 4: Refresh the graph after code changes**

Run:
`graphify update .`

- [ ] **Step 5: Review leftover references**

Run:
`rg -n "assistantParagraphStreaming|paragraphStreaming|reasoningParagraphStreaming" src tests`

Expected: only intentional updated names remain, or no matches for removed helper concepts.
