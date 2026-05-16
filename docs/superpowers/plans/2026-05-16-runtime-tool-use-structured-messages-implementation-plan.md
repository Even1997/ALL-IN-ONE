# Runtime Tool Use Structured Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current text-simulated `tool_use -> local execution -> tool result as plain transcript text` loop with a structured runtime tool message flow, while keeping approval, sandbox, timeline truth, and final-answer rendering stable.

**Architecture:** Keep the fix in the correct layers. Provider adapters should only translate between provider-native tool schemas and the runtime provider event contract. Canonical runtime truth, approval decisions, and local tool execution stay in runtime orchestration. UI must render `thinking`, `tool_execution`, `approval`, and `final_answer` from runtime truth instead of assistant prose reconstruction.

**Tech Stack:** TypeScript, React, Zustand, Node test runner, OpenAI-compatible `chat/completions`, Anthropic `messages`, existing runtime approval store, timeline composer, assistant render model.

---

## 0. Ground Truth

### 0.1 Current Execution Reality

- `executeRuntimeBuiltInAgentTurn()` calls `runAgentTurn()`, which calls `runRuntimeToolLoop()`.
- `runRuntimeToolLoop()` currently keeps a `messages` array shaped like `{ role, content }`.
- Tool requests are discovered from model output in two ways:
  - native provider `tool_call` events when available
  - fallback parsing from assistant text / XML / JSON tool protocol fragments
- After local execution, tool results are appended as a plain text user message:
  - `Tool ${step.name} result:\n${formatToolResult(result)}`
- `runAgentTurn()` still renders the whole transcript back into one prompt string before calling the model again.

### 0.2 Architecture Constraints

- Do not move approval or sandbox decisions into provider adapters.
- Do not change `ToolExecutor` into a policy engine; it remains an execution primitive.
- Do not make UI depend on assistant prose containing tool protocol markers.
- Do not remove XML/text fallback in the first pass; keep it as a compatibility lane until the structured path is verified.
- Do not attempt OpenAI-compatible and Anthropic native result return rewrites in the same first implementation slice.

### 0.3 Product Constraints

- Existing low-risk read-only flows must keep working during the migration.
- High-risk tools must still respect `deny / ask / allow / bypass` policy behavior.
- Final assistant answer must remain clean and not include tool protocol blocks.
- Timeline and right-pane process display must still show tool execution and approval truth even when assistant final prose says nothing about them.

---

## 1. File Map

### 1.1 Core Runtime Files

- `src/modules/ai/runtime/agent-kernel/agentKernelTypes.ts`
- `src/modules/ai/runtime/agent-kernel/runAgentTurn.ts`
- `src/modules/ai/runtime/tools/runtimeToolLoop.ts`
- `src/modules/ai/runtime/tools/toolExecutor.ts`

### 1.2 Provider Adapter Files

- `src/modules/ai/core/AIService.ts`
- `src/modules/ai/gn-agent/runtime/codex/CodexRuntime.ts`
- `src/modules/ai/gn-agent/runtime/claude/ClaudeRuntime.ts`

### 1.3 Approval / Policy Files

- `src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts`
- `src/modules/ai/runtime/orchestration/runtimeApprovalCoordinator.ts`
- `src/modules/ai/runtime/approval/riskPolicy.ts`
- `src/modules/ai/runtime/approval/approvalTypes.ts`

### 1.4 Runtime Truth / UI Files

- `src/modules/ai/runtime/adapters/builtinRuntimeAdapter.ts`
- `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
- `src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts`
- `src/modules/ai/runtime/composer/timelineComposer.ts`
- `src/components/workspace/AIChat.tsx`
- `src/components/workspace/assistantRenderModel.ts`
- `src/components/workspace/assistantMessageOutputModel.ts`
- `src/components/workspace/assistantStreamingDraftProjection.ts`

### 1.5 Compaction / Compatibility / Tests

- `src/modules/ai/runtime/compaction/compactToolResults.ts`
- `src/modules/ai/runtime/orchestration/runtimeDirectChatFlow.ts`
- `tests/ai/*` related runtime, provider, approval, timeline, and UI tests

---

## 2. Execution Order

### Task 1: Lock The Structured Runtime Message Contract With Failing Tests

**Files:**
- Modify: `tests/ai/runtime-tool-loop.test.mjs`
- Modify: `tests/ai/ai-service.test.mjs`
- Modify: `tests/ai/runtime-provider-events.test.mjs`
- Add: `tests/ai/runtime-structured-tool-messages.test.mjs`

- [ ] **Step 1: Add a failing runtime tool-loop contract test**

Add a test that executes one tool-capable turn and asserts the runtime transcript contains distinct semantic entries:
- one user message
- one assistant tool-call message
- one tool-result message bound to the same `toolCallId`
- one final assistant message

Expected failure: current transcript only exposes plain `{ role, content }` messages and collapses tool results into a fake user text message.

- [ ] **Step 2: Add a failing provider request-shape regression test**

Add a test that asserts the structured runtime path can pass message arrays into the provider layer without flattening everything into a single user prompt string.

Expected failure: `runAgentTurn()` still depends on `renderModelPrompt(messages)`.

- [ ] **Step 3: Add a failing approval correlation test**

Add a test that asserts a risky tool call keeps a stable `toolCallId` through approval request creation and approval resolution.

Expected failure: tool approval and transcript shape are not yet formally locked together as a structured contract.

- [ ] **Step 4: Run targeted tests and verify RED**

Run:

```bash
node --test tests/ai/runtime-tool-loop.test.mjs tests/ai/ai-service.test.mjs tests/ai/runtime-provider-events.test.mjs tests/ai/runtime-structured-tool-messages.test.mjs
```

Expected:
- At least the new structured runtime contract tests fail for the current implementation reasons above.

### Task 2: Introduce Structured Runtime Tool Messages Without Rewriting Policy

**Files:**
- Modify: `src/modules/ai/runtime/agent-kernel/agentKernelTypes.ts`
- Modify: `src/modules/ai/runtime/tools/runtimeToolLoop.ts`
- Modify: `src/modules/ai/runtime/agent-kernel/runAgentTurn.ts`

- [ ] **Step 1: Expand the runtime message model**

Replace the single-shape `RuntimeToolMessage` with a discriminated union that can represent:
- user input
- assistant text
- assistant tool call
- tool result

Minimum required fields:
- stable kind/type discriminator
- role where needed
- `toolCallId` on tool-related messages
- raw content string for compatibility where useful

- [ ] **Step 2: Keep the existing loop behavior but stop treating tool results as fake user text**

Inside `runRuntimeToolLoop()`:
- stop using plain `createToolResultMessage()` as the primary semantic representation
- append a structured tool result message instead
- preserve any needed compatibility text only as a serialization detail, not as the source of truth

- [ ] **Step 3: Remove the hard dependency on prompt flattening**

Refactor `runAgentTurn()` so it no longer requires `renderModelPrompt(messages)` as the only model input path.

Goal:
- `runAgentTurn()` can pass structured runtime messages to the next layer
- legacy string rendering may remain as temporary fallback only

- [ ] **Step 4: Keep old XML/text parsing as fallback only**

Do not delete `parseToolCalls()` or text repair logic in this task.
Keep them available for:
- compatibility providers
- malformed outputs
- partial migration periods

- [ ] **Step 5: Run targeted tests and verify GREEN for the new runtime contract**

Run:

```bash
node --test tests/ai/runtime-tool-loop.test.mjs tests/ai/runtime-structured-tool-messages.test.mjs
```

Expected:
- Structured runtime transcript tests pass.
- Existing tool-loop behavior does not regress for fallback parsing.

### Task 3: Add A Structured Provider Entry And Wire OpenAI-Compatible First

**Files:**
- Modify: `src/modules/ai/core/AIService.ts`
- Modify: `src/modules/ai/gn-agent/runtime/codex/CodexRuntime.ts`
- Modify: `tests/ai/ai-service.test.mjs`
- Modify: `tests/ai/runtime-provider-events.test.mjs`

- [ ] **Step 1: Add a structured provider entrypoint**

Introduce a new `AIService` method for structured messages, such as `completeMessages()`.

Requirements:
- accepts structured message arrays
- supports streaming events
- preserves current `thinking`, `text`, and `tool_call` event semantics
- does not break existing `completeText()` callers

- [ ] **Step 2: Map structured runtime messages into OpenAI-compatible payloads**

For OpenAI-compatible requests:
- assistant tool call messages map to native `tool_calls`
- tool results map to `role: "tool"` with `tool_call_id`

Do not attempt to backfill Anthropic native tool-result return in this task.

- [ ] **Step 3: Update `CodexRuntime` to use the structured path for runtime tool turns**

Keep `completeText()` available for non-tool or legacy callers.

- [ ] **Step 4: Keep fallback compatibility**

If the provider returns text-only output or the native tool path cannot be completed:
- preserve the current fallback parsing lane
- do not strand the runtime in an unusable half-migrated state

- [ ] **Step 5: Run targeted provider tests**

Run:

```bash
node --test tests/ai/ai-service.test.mjs tests/ai/runtime-provider-events.test.mjs
```

Expected:
- OpenAI-compatible provider supports structured tool call + tool result round-trips.
- Existing event emission stays compatible with runtime truth consumers.

### Task 4: Preserve Approval And Sandbox Behavior On The New Tool Path

**Files:**
- Modify: `src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts`
- Modify: `src/modules/ai/runtime/orchestration/runtimeApprovalCoordinator.ts`
- Modify: `tests/ai/runtime-chat-turn-coordinator.test.mjs`
- Add: `tests/ai/runtime-tool-approval-correlation.test.mjs`

- [ ] **Step 1: Keep `beforeToolCall` as the single execution gate**

Ensure both:
- native structured tool calls
- fallback parsed tool calls

still pass through the same runtime gate before execution:
- risk classification
- sandbox policy
- approval wait

- [ ] **Step 2: Bind approval records tightly to `toolCallId`**

Approval request and resolution must carry enough context to correlate:
- the runtime tool call
- the approval card
- the resumed execution

Avoid any dependency on assistant prose for this correlation.

- [ ] **Step 3: Add approval regression coverage**

Add tests for:
- risky tool denied by sandbox policy
- risky tool requiring approval
- approval granted resumes the matching tool call only
- approval denied blocks execution and final answer remains coherent

- [ ] **Step 4: Run targeted approval tests**

Run:

```bash
node --test tests/ai/runtime-chat-turn-coordinator.test.mjs tests/ai/runtime-tool-approval-correlation.test.mjs
```

Expected:
- Policy behavior is unchanged from the user perspective.
- Structured tool path does not bypass approval.

### Task 5: Move UI And Timeline Rendering Fully Onto Runtime Truth

**Files:**
- Modify: `src/modules/ai/runtime/adapters/builtinRuntimeAdapter.ts`
- Modify: `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
- Modify: `src/modules/ai/runtime/composer/timelineComposer.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/assistantRenderModel.ts`
- Modify: `src/components/workspace/assistantMessageOutputModel.ts`
- Modify: `src/components/workspace/assistantStreamingDraftProjection.ts`
- Modify: `tests/ai/assistant-render-model.test.mjs`
- Modify: `tests/ai/ai-chat-direct-streaming-display-source.test.mjs`

- [ ] **Step 1: Keep canonical event semantics unchanged**

`tool.started`, tool result, approval, and final message completion should continue to come from runtime truth.

Do not make the UI reconstruct tool execution from assistant prose.

- [ ] **Step 2: Separate display lanes clearly**

UI must render distinct surfaces for:
- thinking
- tool execution
- approval
- final answer

The final answer lane must not include `Tool xxx result` protocol text.

- [ ] **Step 3: Ensure streaming draft logic respects the new truth model**

Streaming draft projection should:
- show live tool/thinking progress from runtime events
- show final answer as durable answer body
- avoid regressing into one merged chat blob

- [ ] **Step 4: Run targeted rendering tests**

Run:

```bash
node --test tests/ai/assistant-render-model.test.mjs tests/ai/ai-chat-direct-streaming-display-source.test.mjs
```

Expected:
- UI displays runtime tool execution truth even if final prose does not mention tools.
- Final answer surface remains clean.

### Task 6: Clean Up Compaction, Compatibility, And Anthropic Follow-Up Hook

**Files:**
- Modify: `src/modules/ai/runtime/compaction/compactToolResults.ts`
- Modify: `src/modules/ai/runtime/orchestration/runtimeDirectChatFlow.ts`
- Modify: `src/modules/ai/gn-agent/runtime/claude/ClaudeRuntime.ts`
- Modify: related tests as needed

- [ ] **Step 1: Update compaction to understand structured tool-result messages**

Current compaction logic is text-oriented. Update it so it trims or summarizes tool-result payloads without destroying message semantics.

- [ ] **Step 2: Shrink text-protocol sanitization to compatibility scope**

Keep XML / DSML / tool protocol sanitization for fallback lanes, but stop treating it as the primary runtime tool flow.

- [ ] **Step 3: Add the Anthropic native return path**

Once OpenAI-compatible is stable, extend the structured runtime path to return tool results using Anthropic-native semantics.

- [ ] **Step 4: Full targeted verification**

Run:

```bash
node --test tests/ai/ai-service.test.mjs tests/ai/runtime-provider-events.test.mjs tests/ai/runtime-tool-loop.test.mjs tests/ai/runtime-chat-turn-coordinator.test.mjs tests/ai/assistant-render-model.test.mjs tests/ai/ai-chat-direct-streaming-display-source.test.mjs
```

Expected:
- Structured path passes.
- Fallback path still works.
- No approval regressions.

### Task 7: Build, Manual Verify, And Refresh Graph

**Files:**
- Verify only

- [ ] **Step 1: Run the broader AI/runtime test slice**

```bash
node --test tests/ai/ai-service.test.mjs tests/ai/runtime-provider-events.test.mjs tests/ai/runtime-tool-loop.test.mjs tests/ai/runtime-chat-turn-coordinator.test.mjs tests/ai/assistant-render-model.test.mjs tests/ai/ai-chat-direct-streaming-display-source.test.mjs
```

- [ ] **Step 2: Run build**

```bash
npm run build
```

- [ ] **Step 3: Manual verification**

Manual checks:
- a read-only tool turn still works
- a risky tool prompts approval
- approval denial blocks execution cleanly
- approval grant resumes execution cleanly
- final answer does not include protocol junk
- tool execution still shows in timeline / right pane

- [ ] **Step 4: Refresh graph**

```bash
graphify update .
```

Expected:
- Tests and build pass.
- Graph refresh succeeds, or any graph failure is recorded as tooling-only and not treated as a runtime regression.

---

## 3. Recommended Commit Order

- [ ] Commit 1: `test(runtime): lock structured tool message contract`
- [ ] Commit 2: `refactor(runtime): add structured tool transcript model`
- [ ] Commit 3: `feat(ai-service): add structured provider message entry`
- [ ] Commit 4: `feat(runtime): wire openai-compatible native tool results`
- [ ] Commit 5: `test(runtime): lock approval correlation for tool calls`
- [ ] Commit 6: `feat(ui): render tool execution from runtime truth`
- [ ] Commit 7: `refactor(runtime): update compaction and compatibility lanes`

---

## 4. Verification Checklist

- [ ] Runtime transcript distinguishes user input, assistant tool call, tool result, and final answer
- [ ] `runAgentTurn()` no longer depends exclusively on flattening messages into a single prompt string
- [ ] OpenAI-compatible provider supports structured tool call and tool result round-trips
- [ ] High-risk tools still respect `deny / ask / allow / bypass`
- [ ] Approval records correlate to `toolCallId`
- [ ] Tool execution UI renders from runtime truth, not assistant prose parsing
- [ ] Final answer surface does not contain `Tool xxx result` protocol text
- [ ] Fallback XML/text tool path still works during migration
- [ ] `npm run build`
- [ ] `graphify update .`

---

## 5. Done Definition

- The primary tool-capable runtime path no longer depends on simulating tool-result continuation as plain transcript text.
- Provider adapters accept structured runtime messages and return provider-native tool semantics without taking over local permission policy.
- Approval and sandbox behavior are unchanged from the user perspective, but now correlate directly to structured tool-call identity.
- UI and timeline surfaces show `thinking`, `tool_execution`, `approval`, and `final_answer` from runtime truth rather than assistant prose reconstruction.
- The old XML/text protocol remains only as a compatibility path instead of the main execution model.
