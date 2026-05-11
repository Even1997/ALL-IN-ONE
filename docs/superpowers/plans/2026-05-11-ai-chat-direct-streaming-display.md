# AI Chat Direct Streaming Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make assistant text render at the actual `turn.delta` receive speed instead of waiting for slower draft/message synchronization.

**Architecture:** Keep `turn.delta` / canonical event ingestion as the fast path for visible text, and treat rebuilt `message.timeline` plus persisted `message.delta` as reconciliation/finalization data. During streaming, the UI should render from runtime projection (`activeMessage` / direct streaming payload) first, then fall back to persisted assistant timeline after completion.

**Tech Stack:** React, Zustand, TypeScript, runtime sidecar event bridge, runtime canonical timeline composer, Node source tests.

---

## Root Cause Summary

1. Runtime already emits raw text chunks immediately via `turn.delta` in [C:/Users/Even/Documents/ALL-IN-ONE/apps/runtime/src/index.ts:747](C:/Users/Even/Documents/ALL-IN-ONE/apps/runtime/src/index.ts:747).
2. The same runtime also rebuilds assistant timeline and broadcasts full `message.delta` via the slower `draftSyncScheduler -> persistAssistantMessage(false)` path in [C:/Users/Even/Documents/ALL-IN-ONE/apps/runtime/src/index.ts:574](C:/Users/Even/Documents/ALL-IN-ONE/apps/runtime/src/index.ts:574) and [C:/Users/Even/Documents/ALL-IN-ONE/apps/runtime/src/index.ts:622](C:/Users/Even/Documents/ALL-IN-ONE/apps/runtime/src/index.ts:622).
3. The canonical composer already has a fast streaming text model in `projection.activeMessage.text` at [C:/Users/Even/Documents/ALL-IN-ONE/src/modules/ai/runtime/composer/timelineComposer.ts:352](C:/Users/Even/Documents/ALL-IN-ONE/src/modules/ai/runtime/composer/timelineComposer.ts:352).
4. The chat message renderer still builds assistant text from `draftState.timeline` or `message.timeline` in [C:/Users/Even/Documents/ALL-IN-ONE/src/components/workspace/assistantRenderModel.ts:42](C:/Users/Even/Documents/ALL-IN-ONE/src/components/workspace/assistantRenderModel.ts:42) and [C:/Users/Even/Documents/ALL-IN-ONE/src/components/ai/gn-agent/GNAgentMessageItem.tsx:93](C:/Users/Even/Documents/ALL-IN-ONE/src/components/ai/gn-agent/GNAgentMessageItem.tsx:93).
5. Result: content is often already received, but the visible text waits for the slower reconstructed-message lane, so refresh can “jump ahead”.

## File Map

**Modify**
- `C:/Users/Even/Documents/ALL-IN-ONE/src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
  - Extend the projection/model used by chat messages so assistant messages can consume fast streaming text from canonical events.
- `C:/Users/Even/Documents/ALL-IN-ONE/src/modules/ai/runtime/composer/timelineComposerTypes.ts`
  - Confirm or extend the projection contract used for active streaming text.
- `C:/Users/Even/Documents/ALL-IN-ONE/src/components/workspace/assistantRenderModel.ts`
  - Add a fast-path assistant render source that prefers active streaming text over rebuilt timeline text while streaming.
- `C:/Users/Even/Documents/ALL-IN-ONE/src/components/ai/gn-agent/GNAgentMessageItem.tsx`
  - Pass runtime projection/streaming state into the assistant render model.
- `C:/Users/Even/Documents/ALL-IN-ONE/src/components/workspace/AIChatConversationMessagesPane.tsx`
  - Thread the per-message projection into the message list.
- `C:/Users/Even/Documents/ALL-IN-ONE/src/components/workspace/AIChat.tsx`
  - Stop treating local draft flush cadence as the authoritative visible text source for sidecar streaming.
- `C:/Users/Even/Documents/ALL-IN-ONE/src/components/workspace/AIChatAssistantParts.tsx`
  - Keep streaming text in raw append mode and make sure the streaming visual style matches direct display.

**Test**
- `C:/Users/Even/Documents/ALL-IN-ONE/tests/ai/ai-chat-streaming-render-source.test.mjs`
- `C:/Users/Even/Documents/ALL-IN-ONE/tests/ai/ai-chat-streaming-latency-source.test.mjs`
- `C:/Users/Even/Documents/ALL-IN-ONE/tests/ai/ai-chat-runtime-output-flow.test.mjs`
- `C:/Users/Even/Documents/ALL-IN-ONE/tests/ai/ai-chat-performance-boundary-source.test.mjs`
- `C:/Users/Even/Documents/ALL-IN-ONE/tests/ai/runtime-sidecar-streaming-persistence-source.test.mjs`
- Create: `C:/Users/Even/Documents/ALL-IN-ONE/tests/ai/ai-chat-direct-streaming-display-source.test.mjs`

### Task 1: Lock The Direct-Display Contract With Tests

**Files:**
- Modify: `C:/Users/Even/Documents/ALL-IN-ONE/tests/ai/ai-chat-streaming-render-source.test.mjs`
- Modify: `C:/Users/Even/Documents/ALL-IN-ONE/tests/ai/ai-chat-performance-boundary-source.test.mjs`
- Create: `C:/Users/Even/Documents/ALL-IN-ONE/tests/ai/ai-chat-direct-streaming-display-source.test.mjs`

- [ ] **Step 1: Add a source-level test that the assistant render path can consume projection-backed streaming text**

Expected assertions:
- `assistantRenderModel.ts` contains a streaming override source like `streamingText` or `projection.activeMessage.text`
- `GNAgentMessageItem.tsx` passes that override into `buildAssistantRenderModel(...)`
- the active message projection is used only while streaming

- [ ] **Step 2: Add a regression test that the sidecar chat path no longer relies on draft-only text for visible output**

Expected assertions:
- `AIChatConversationMessagesPane.tsx` threads per-message projection or fast streaming state
- `AIChat.tsx` does not make `streamingDraftContents` the only live text source for sidecar rendering

- [ ] **Step 3: Run focused tests to confirm the new contract fails before implementation**

Run:
```powershell
node --test tests/ai/ai-chat-streaming-render-source.test.mjs tests/ai/ai-chat-performance-boundary-source.test.mjs tests/ai/ai-chat-direct-streaming-display-source.test.mjs
```

Expected:
- new assertions fail because the current code still renders assistant text from `draftState.timeline` / `message.timeline`

### Task 2: Expose Fast Streaming Text To The Message Renderer

**Files:**
- Modify: `C:/Users/Even/Documents/ALL-IN-ONE/src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
- Modify: `C:/Users/Even/Documents/ALL-IN-ONE/src/modules/ai/runtime/composer/timelineComposerTypes.ts`
- Modify: `C:/Users/Even/Documents/ALL-IN-ONE/src/components/workspace/AIChatConversationMessagesPane.tsx`
- Modify: `C:/Users/Even/Documents/ALL-IN-ONE/src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx`

- [ ] **Step 1: Add a per-message streaming projection contract**

Implementation target:
- build a lookup keyed by `message.id`
- for the current assistant message, surface:
  - `streamingText`
  - `isStreaming`
  - optional reasoning state if needed later

- [ ] **Step 2: Prefer canonical projection data over session message text during streaming**

Implementation rule:
- `projection.activeMessage.text` should be considered the visible truth while a message is still streaming
- `message.timeline` remains the fallback for completed messages and persisted history

- [ ] **Step 3: Thread the new projection into the message list components**

Implementation target:
- `AIChatConversationMessagesPane`
- `GNAgentMessageList`
- `GNAgentMessageItem`

- [ ] **Step 4: Run focused tests**

Run:
```powershell
node --test tests/ai/ai-chat-direct-streaming-display-source.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs
```

Expected:
- projection contract tests pass

### Task 3: Switch Assistant Text Rendering To Actual-Received Speed

**Files:**
- Modify: `C:/Users/Even/Documents/ALL-IN-ONE/src/components/workspace/assistantRenderModel.ts`
- Modify: `C:/Users/Even/Documents/ALL-IN-ONE/src/components/ai/gn-agent/GNAgentMessageItem.tsx`
- Modify: `C:/Users/Even/Documents/ALL-IN-ONE/src/components/workspace/AIChat.tsx`
- Modify: `C:/Users/Even/Documents/ALL-IN-ONE/src/components/workspace/AIChatAssistantParts.tsx`

- [ ] **Step 1: Extend `buildAssistantRenderModel(...)` to accept a direct streaming text override**

Implementation rule:
- when `streamingTextOverride` is present and `isStreaming` is true, use it for the text part content
- keep thinking lane and other timeline-derived metadata intact unless they visibly lag too

- [ ] **Step 2: Make `GNAgentMessageItem` render assistant text from the fast source first**

Implementation rule:
- do not block visible text on `draftState.timeline`
- `draftState.timeline` may still drive reasoning lanes while text uses the fast source

- [ ] **Step 3: Reduce or remove front-end draft flush authority in the sidecar path**

Implementation target:
- `streamingDraftContents` can remain for reasoning/tool UI if needed
- assistant plain text should not wait for `requestAnimationFrame(flushStreamingDraftContents)`

- [ ] **Step 4: Keep streaming style simple and direct**

Implementation rule:
- raw append text
- lightweight caret
- no per-character reveal, no secondary pacing

- [ ] **Step 5: Run focused tests**

Run:
```powershell
node --test tests/ai/ai-chat-streaming-render-source.test.mjs tests/ai/ai-chat-direct-streaming-display-source.test.mjs tests/ai/ai-chat-performance-boundary-source.test.mjs
```

Expected:
- assistant render path now prefers actual-received streaming text

### Task 4: Verify Latency, Build, And Real Chat Behavior

**Files:**
- Modify if needed: `C:/Users/Even/Documents/ALL-IN-ONE/src/components/workspace/AIChat.tsx`
- Modify if needed: `C:/Users/Even/Documents/ALL-IN-ONE/src/modules/ai/runtime/streamingLatencyTrace.ts`

- [ ] **Step 1: Verify source-level latency plumbing still measures the correct milestones**

Check:
- `providerFirstChunkAt`
- `runtimeBroadcastAt`
- `sidecarReceivedAt`
- `frontendStateFlushAt`
- `firstVisibleCharAt`

- [ ] **Step 2: Run the full focused regression set**

Run:
```powershell
node --test tests/ai/ai-chat-streaming-render-source.test.mjs tests/ai/ai-chat-streaming-latency-source.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs tests/ai/ai-chat-performance-boundary-source.test.mjs tests/ai/runtime-sidecar-streaming-persistence-source.test.mjs tests/ai/ai-chat-direct-streaming-display-source.test.mjs
```

Expected:
- all tests pass

- [ ] **Step 3: Run the app build**

Run:
```powershell
npm run build
```

Expected:
- build succeeds without type regressions

- [ ] **Step 4: Manual verification in a real chat session**

Manual acceptance:
- first visible text follows actual received chunks
- no obvious “already arrived but UI still replaying” lag
- refresh does not reveal large hidden progress jumps
- completed markdown still renders correctly after streaming ends

### Task 5: Refresh The Code Graph

**Files:**
- Update graph output: `C:/Users/Even/Documents/ALL-IN-ONE/graphify-out/*`

- [ ] **Step 1: Rebuild the graph after code changes**

Run:
```powershell
graphify update .
```

Expected:
- graph refresh completes successfully

## Self-Review

- Spec coverage: this plan addresses the exact reported symptom: text is received early but displayed late, and the fix is to render from the actual receive-speed source.
- Placeholder scan: file paths, target modules, verification commands, and acceptance criteria are explicit.
- Type consistency: the plan keeps current runtime naming: `turn.delta`, `message.delta`, `activeMessage`, `streamingText`, `draftState`, `timeline`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-11-ai-chat-direct-streaming-display.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
