# AI Chat Structured Block Timeline Unification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify AI chat process rendering and final rendering onto one structured block timeline so `thinking`, `tool`, `feedback`, and `final` each have a single source of truth and completed messages stop mutating when later turns stream.

**Architecture:** Preserve the existing layer order `provider protocol adapters -> canonical runtime events -> timeline composer / conversation projection -> assistant render model / UI composition`, but change the assistant output contract so structured output is consumed as block truth instead of being reparsed into mixed string timelines. The main cutover is to replace string-based `<think> + text` draft assembly and paragraph reconciliation with a canonical block model shared by running and completed states.

**Tech Stack:** React, TypeScript, Zustand, Tauri runtime sidecar, node:test, graphify

---

## Why This Plan Exists

The current system still mixes three different message truths:

1. Provider-native stream events: `thinking`, `text`, `tool_call`, `done`
2. Canonical runtime projection: cards plus one `activeMessage.text` / `finalMessage.text`
3. Legacy assistant draft assembly: `<think>...</think>` string building, timeline rebuild, and final paragraph reconciliation

This causes four recurring classes of bugs:

1. Running output and completed output do not come from the same visible block model.
2. `feedback` is parsed but not promoted into a first-class process item, so the model follows the prompt but the UI ignores the structure.
3. `thinking` is partly canonical status and partly legacy reconstructed text, so order and visibility drift.
4. Temporary draft state can leak into persisted message state, which lets a later turn visually change an earlier completed message.

This plan fixes the problem by making the runtime and UI render exactly one structured message output model.

## Current Reality

### Real running chain today

1. Prompt requests `<feedback>` and `<final>` in:
   - `src/modules/ai/chat/directChatPrompt.ts`
2. Provider emits `thinking` / `text` / `tool_call` / `done` in:
   - `src/modules/ai/runtime/provider/runtimeProviderEvents.ts`
3. Built-in adapter maps:
   - `thinking -> progress.updated`
   - `text -> message.delta`
   - `done -> message.completed`
   in `src/modules/ai/runtime/adapters/builtinRuntimeAdapter.ts`
4. Runtime streaming assembler still builds mixed string drafts in:
   - `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`
5. UI still rebuilds draft timelines and visible assistant parts in:
   - `src/modules/ai/store/assistantTimeline.ts`
   - `src/components/workspace/assistantStreamingDraftProjection.ts`
   - `src/components/workspace/assistantRenderModel.ts`
6. Final rendering combines:
   - canonical timeline cards
   - draft timeline
   - assistant text join
   inside:
   - `src/components/workspace/assistantMessageOutputModel.ts`
   - `src/components/ai/gn-agent/GNAgentMessageItem.tsx`

### The concrete problems to eliminate

1. `feedback` is parsed but not rendered as a first-class process block.
2. `final` is durable, but the running body is still assembled from a different path.
3. `thinking` content is visible, but its ordering still depends on timeline rebuilding rather than one canonical message output stream.
4. Tool rendering is canonical, while text rendering is not, so the timeline can look correct for tools but wrong for text.
5. Message text is still frequently treated as one large joined body, so true block-level progression is lost.
6. Draft buffers can still influence persisted message appearance across turns.

## Target Contract

### Output boundary

- `thinking`
  - visible in the process timeline
  - never copied into final body
  - never reparsed from final answer text
- `tool`
  - visible from runtime and canonical tool events only
  - never reconstructed from raw prose as the main path
- `feedback`
  - optional process prose
  - visible only in process timeline
  - not persisted as the durable completed answer body
- `final`
  - the only durable final answer body
  - rendered once after completion

### Rendering rule

- Running state:
  - render one ordered process timeline made of `thinking`, `tool`, `feedback`, and live `final` block progress
- Completed state:
  - fold or retain process items as process history
  - render one final body once
- Historical replay:
  - rebuild from the same structured block truth
  - never use a different fallback renderer for old messages

## File Structure

### Create

- `src/modules/ai/runtime/output/buildStructuredMessageBlocks.ts`
- `tests/ai/runtime-structured-message-blocks.test.mjs`
- `tests/ai/assistant-process-final-source.test.mjs`

### Modify

- `src/modules/ai/chat/directChatPrompt.ts`
- `src/modules/ai/runtime/output/assistantOutputTypes.ts`
- `src/modules/ai/runtime/output/parseStructuredAssistantOutput.ts`
- `src/modules/ai/runtime/adapters/builtinRuntimeAdapter.ts`
- `src/modules/ai/runtime/composer/timelineComposerTypes.ts`
- `src/modules/ai/runtime/composer/timelineComposer.ts`
- `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`
- `src/modules/ai/runtime/orchestration/runtimeChatTurnStreaming.ts`
- `src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts`
- `src/modules/ai/store/assistantTimeline.ts`
- `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- `src/modules/runtime-sidecar/runtimeSidecarCanonical.ts`
- `src/components/workspace/assistantStreamingDraftProjection.ts`
- `src/components/workspace/assistantRenderModel.ts`
- `src/components/workspace/assistantMessageOutputModel.ts`
- `src/components/workspace/timeline/chatMessageTimelineRenderModel.ts`
- `src/components/workspace/timeline/chatTimelineBubbleCardModel.ts`
- `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
- `src/components/workspace/AIChat.tsx`
- `tests/ai/runtime-streaming-assembler.test.mjs`
- `tests/ai/runtime-chat-turn-streaming.test.mjs`
- `tests/ai/assistant-render-model.test.mjs`
- `tests/ai/assistant-streaming-draft-projection.test.mjs`
- `tests/ai/gn-agent-message-item.test.mjs`
- `tests/ai/ai-chat-runtime-output-flow.test.mjs`

### Retire Or Reduce

- `src/components/workspace/aiChatMessageParts.ts`
  - keep only compatibility parsing if needed
  - remove it as the main assistant output truth source
- `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`
  - remove `<think>` string assembly as primary draft truth
  - remove paragraph reconciliation as primary completion truth
- `src/components/workspace/assistantRenderModel.ts`
  - stop joining all assistant text as the only answer model
- `src/components/workspace/AIChat.tsx`
  - reduce `streamingDraftBufferRef` to a temporary UI staging role only

## Delete / Replace Plan

### Delete as primary logic

1. `buildRuntimeStreamingMessage()` string-first truth in `agentTurnRunner.ts`
2. `reconcileFinalAssistantParts()` as a required correctness path
3. `reconcileFinalAssistantPartsByParagraph()` as a required correctness path
4. `getAssistantTimelineText()` as the sole answer body builder for the assistant UI
5. `assistantRenderModel` answer generation by direct text join
6. any process ordering logic that depends on mixing:
   - reconstructed assistant parts
   - canonical cards
   - temporary draft overlays

### Keep only as compatibility edge logic

1. `<think>` parsing for legacy stored assistant content
2. raw tool markup parsing for legacy history only
3. message-content fallback parsing only when older persisted messages have no canonical output blocks

## Implementation Tasks

### Task 1: Lock The New Output Truth In Tests

**Files:**
- Modify: `tests/ai/runtime-streaming-assembler.test.mjs`
- Add: `tests/ai/runtime-structured-message-blocks.test.mjs`
- Add: `tests/ai/assistant-process-final-source.test.mjs`
- Modify: `tests/ai/assistant-streaming-draft-projection.test.mjs`
- Modify: `tests/ai/assistant-render-model.test.mjs`
- Modify: `tests/ai/gn-agent-message-item.test.mjs`

- [ ] Add tests that define one structured output contract for `thinking`, `tool`, `feedback`, and `final`.
- [ ] Add tests proving `feedback` renders in process only and does not become the durable final body.
- [ ] Add tests proving running and completed assistant views come from the same ordered block model.
- [ ] Add tests proving a later turn cannot mutate the final body of an earlier completed assistant message.
- [ ] Run:
`node --test tests/ai/runtime-streaming-assembler.test.mjs tests/ai/runtime-structured-message-blocks.test.mjs tests/ai/assistant-process-final-source.test.mjs tests/ai/assistant-streaming-draft-projection.test.mjs tests/ai/assistant-render-model.test.mjs tests/ai/gn-agent-message-item.test.mjs`
- [ ] Verify these tests fail before code changes for the expected reasons:
  - no first-class `feedback` output lane
  - string-based draft assembly still active
  - completed and running render paths still diverge

### Task 2: Introduce Structured Message Blocks In The Runtime Output Layer

**Files:**
- Modify: `src/modules/ai/runtime/output/assistantOutputTypes.ts`
- Modify: `src/modules/ai/runtime/output/parseStructuredAssistantOutput.ts`
- Create: `src/modules/ai/runtime/output/buildStructuredMessageBlocks.ts`

- [ ] Define explicit output block types for:
  - `thinking`
  - `feedback`
  - `final`
  - compatibility metadata for partial streaming state
- [ ] Make `parseStructuredAssistantOutput()` return enough information to support partial block streaming, not just final strings.
- [ ] Keep backward compatibility for plain untagged responses by treating them as `final` only.
- [ ] Keep parsing responsibilities local to this layer so UI files no longer infer semantics from mixed strings.
- [ ] Run:
`node --test tests/ai/runtime-structured-message-blocks.test.mjs`

### Task 3: Replace String-First Draft Assembly With Block-First Draft Assembly

**Files:**
- Modify: `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`
- Modify: `src/modules/ai/runtime/orchestration/runtimeChatTurnStreaming.ts`
- Modify: `src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts`

- [ ] Remove `<think>`-first draft truth from `createRuntimeStreamingMessageAssembler()`.
- [ ] Stop using paragraph reconciliation as a correctness mechanism for final output.
- [ ] Accumulate streaming text into structured output block state:
  - current `feedback` block if the partial output is inside `<feedback>`
  - current `final` block if the partial output is inside `<final>`
  - plain `final` if no tags are present
- [ ] Keep `thinking` independent from assistant prose blocks and sourced from runtime stream events.
- [ ] At finalize time, persist one stable structured result without needing paragraph rewrite heuristics.
- [ ] Run:
`node --test tests/ai/runtime-streaming-assembler.test.mjs tests/ai/runtime-chat-turn-streaming.test.mjs`

### Task 4: Promote Structured Blocks Into Canonical Projection

**Files:**
- Modify: `src/modules/ai/runtime/adapters/builtinRuntimeAdapter.ts`
- Modify: `src/modules/ai/runtime/composer/timelineComposerTypes.ts`
- Modify: `src/modules/ai/runtime/composer/timelineComposer.ts`

- [ ] Extend projection state so `activeMessage` and `finalMessage` can carry structured block information rather than a single large text string only.
- [ ] Keep tool lifecycle and run lifecycle unchanged as canonical truth.
- [ ] Keep `thinking` status signals lightweight at the canonical layer, but ensure projection can expose them in stable order with output blocks.
- [ ] Ensure `feedback` becomes a visible process block in projection order instead of disappearing into final parsing only.
- [ ] Ensure `final` is represented as the one durable completed response body.
- [ ] Run:
`node --test tests/ai/runtime-timeline-composer.test.mjs tests/ai/runtime-conversation-gateway.test.mjs`

### Task 5: Collapse Assistant Timeline Rebuild Logic To Compatibility Only

**Files:**
- Modify: `src/modules/ai/store/assistantTimeline.ts`
- Modify: `src/components/workspace/assistantStreamingDraftProjection.ts`

- [ ] Stop rebuilding the main running answer body from mixed serialized assistant content.
- [ ] Reduce assistant timeline helpers to:
  - legacy compatibility parsing
  - reasoning visibility metadata
  - runtime event compatibility where needed
- [ ] Make `projectAssistantStreamingDraft()` consume projection block truth first and only fall back to legacy timeline compatibility for old stored messages.
- [ ] Ensure draft projection clears as soon as canonical completed content is available and no overlay is still needed.
- [ ] Run:
`node --test tests/ai/assistant-streaming-draft-projection.test.mjs tests/ai/assistant-timeline-events.test.mjs`

### Task 6: Build One Shared Message Output Model For Running And Completed UI

**Files:**
- Modify: `src/components/workspace/assistantRenderModel.ts`
- Modify: `src/components/workspace/assistantMessageOutputModel.ts`
- Modify: `src/components/workspace/timeline/chatMessageTimelineRenderModel.ts`
- Modify: `src/components/workspace/timeline/chatTimelineBubbleCardModel.ts`

- [ ] Make the render model consume one ordered list of:
  - thinking items
  - tool cards
  - feedback blocks
  - live final block
  - completed final block
- [ ] Remove answer-body generation by `join('\n\n')` as the primary truth.
- [ ] Make running output and completed output differ only by visibility state, not by source or reconstruction strategy.
- [ ] Ensure final answer appears once and only once after completion.
- [ ] Keep process-fold elapsed time logic, but source it from the same completed response model.
- [ ] Run:
`node --test tests/ai/assistant-render-model.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs tests/ai/message-timeline-ordering.test.mjs`

### Task 7: Simplify Message Item Rendering And Remove Cross-Turn State Pollution

**Files:**
- Modify: `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
- Modify: `src/components/workspace/AIChat.tsx`

- [ ] Make `GNAgentMessageItem` render from one shared process/final output model only.
- [ ] Keep process fold UI, but remove any remaining local assumptions that process and final come from different sources.
- [ ] Reduce `streamingDraftBufferRef` to ephemeral staging:
  - no historical assistant mutation
  - no cross-turn overwrite
  - no re-deriving old final content from later live state
- [ ] Keep current latency instrumentation, but attach it to the single running final block path.
- [ ] Run:
`node --test tests/ai/gn-agent-message-item.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs tests/ai/ai-chat-streaming-render-source.test.mjs`

### Task 8: Align Runtime Sidecar Replay With The Same Final Truth

**Files:**
- Modify: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Modify: `src/modules/runtime-sidecar/runtimeSidecarCanonical.ts`

- [ ] Stop replay from blindly treating `message.content` as the only completed final answer truth for all assistant messages.
- [ ] Rebuild replayed completed answer content from the same structured final block model where available.
- [ ] Keep compatibility fallback only for older sessions that predate structured blocks.
- [ ] Ensure sidecar replay and live runtime produce the same completed message appearance.
- [ ] Run:
`node --test tests/ai/runtime-sidecar-session-bridge.test.mjs tests/ai/runtime-sidecar-streaming-persistence-source.test.mjs`

### Task 9: Full Verification And Graph Refresh

**Files:**
- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`
- Modify: `graphify-out/manifest.json`

- [ ] Run the focused AI chat regression suite:
`node --test tests/ai/runtime-streaming-assembler.test.mjs tests/ai/runtime-structured-message-blocks.test.mjs tests/ai/assistant-process-final-source.test.mjs tests/ai/runtime-chat-turn-streaming.test.mjs tests/ai/runtime-timeline-composer.test.mjs tests/ai/runtime-conversation-gateway.test.mjs tests/ai/assistant-streaming-draft-projection.test.mjs tests/ai/assistant-render-model.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs tests/ai/gn-agent-message-item.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs tests/ai/ai-chat-streaming-render-source.test.mjs tests/ai/runtime-sidecar-session-bridge.test.mjs`
- [ ] Run:
`npm run build`
- [ ] Run:
`git diff --check`
- [ ] Run:
`graphify update .`
- [ ] Run cleanup search:
`rg -n "reconcileFinalAssistantPartsByParagraph|buildRuntimeStreamingMessage\\(|streamingDraftBufferRef|getAssistantTimelineText\\(" src tests`
- [ ] Verify only intentional compatibility references remain.

## Acceptance Criteria

1. Running assistant output and completed assistant output come from the same block timeline source.
2. `feedback` is visible in process and absent from durable final body.
3. `final` is rendered exactly once after completion.
4. `thinking` never becomes final body content.
5. Tool execution order remains canonical and stable relative to visible process prose.
6. Refreshing or replaying a completed session reproduces the same completed message shape.
7. Starting a new turn does not mutate the visible content of a previous completed assistant turn.

## Risks And Mitigations

### Risk 1: Old compatibility logic quietly remains the real source

Mitigation:
- add source-level tests that search for the removed primary paths
- keep compatibility code behind explicit fallback branches only

### Risk 2: Runtime truth gets polluted by UI-only concerns

Mitigation:
- restrict semantic changes to structured output consumption and projection shape
- do not move presentation-only rules into provider adapters unless they are truly protocol-level

### Risk 3: Replay and live mode diverge again

Mitigation:
- make sidecar replay consume the same structured final model
- keep one acceptance test that compares replay and live visible output assumptions

## Recommended Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7
8. Task 8
9. Task 9

## Expected End State

After this cutover:

- the model still follows a simple prompt contract
- runtime still owns tool truth and canonical ordering
- UI stops guessing assistant semantics from stitched strings
- process rendering and final rendering become the same system in different display states
- historical completed messages stop changing when later turns stream
