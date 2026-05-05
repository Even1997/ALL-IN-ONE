# Event Plane V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish a coherent Event Plane V1 so assistant output, runtime trace, approvals, questions, and streaming drafts all flow through one shared event path.

**Architecture:** Keep the current assistant timeline model, but promote it from a message-rendering detail into the shared event plane for AI chat. Move repeated runtime-event mutations into shared helpers, preserve runtime events while streaming drafts update, and make AIChat consume those helpers instead of hand-editing timeline arrays in many places.

**Tech Stack:** React 19, TypeScript, Zustand, existing AI runtime helpers, Node test runner

---

### Task 1: Lock the event-plane behavior with focused tests

**Files:**
- Create: `tests/ai/assistant-timeline-events.test.mjs`
- Modify: `tests/ai/agent-event-dispatch.test.mjs`
- Modify: `tests/ai/ai-chat-store.test.mjs`
- Test: `tests/ai/assistant-timeline-events.test.mjs`

- [x] **Step 1: Add helper-level tests for timeline runtime-event mutations**

Cover:
- appending a runtime event without disturbing text/reasoning event order
- upserting tool use and tool result through assistant timeline helpers
- updating approval/question status through assistant timeline helpers
- building a draft timeline from text while preserving existing runtime events

- [x] **Step 2: Extend runtime event tests for generic upsert/update helpers**

Cover:
- approval event creation and update
- question event creation and answered-state update
- stable `createdAt` behavior when an event is re-upserted

- [x] **Step 3: Extend store-level tests for assistant timeline persistence**

Cover:
- assistant messages keep mixed text/reasoning/runtime events after persistence
- helper-driven updates do not reintroduce `content` on assistant messages

- [x] **Step 4: Run the focused test set and confirm failures point at missing helpers**

Run: `node --test tests/ai/assistant-timeline-events.test.mjs tests/ai/agent-event-dispatch.test.mjs tests/ai/ai-chat-store.test.mjs`

Expected: failing assertions for the new helper APIs and draft-preservation behavior.

### Task 2: Build shared runtime-event helpers in the foundation layer

**Files:**
- Modify: `src/modules/ai/runtime/dispatch/agentEvents.ts`
- Modify: `src/modules/ai/store/assistantTimeline.ts`

- [x] **Step 1: Add generic runtime-event upsert/update helpers in `agentEvents.ts`**

Implement:
- generic matcher-based runtime event upsert helper
- approval event upsert helper
- question event upsert helper
- question/approval patch helpers for status transitions

- [x] **Step 2: Add assistant-timeline helpers that own runtime-event mutation**

Implement:
- append runtime event to timeline
- map runtime events in timeline
- upsert tool use/result in timeline
- upsert approval/question in timeline
- build text/reasoning draft timeline while preserving runtime events from a base timeline

- [x] **Step 3: Keep the helper API narrow and composable**

Rules:
- no new store abstraction
- no speculative session-wide runtime bus yet
- helpers should work on plain arrays so AIChat and tests can call them directly

- [x] **Step 4: Run the focused test set again**

Run: `node --test tests/ai/assistant-timeline-events.test.mjs tests/ai/agent-event-dispatch.test.mjs`

Expected: helper tests pass, UI integration tests still pending.

### Task 3: Migrate AIChat onto the shared event plane

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/assistantRenderModel.ts`

- [x] **Step 1: Replace ad hoc timeline array edits with assistant-timeline helpers**

Touch:
- runtime event append
- runtime event patch
- tool use/result upsert
- approval creation and resolution
- question creation and answered-state update

- [x] **Step 2: Preserve runtime events inside streaming draft updates**

Change:
- `StreamingDraftState` should keep the full event-plane view for the current assistant message
- draft-building paths should merge fresh text/reasoning with the message's existing runtime events

- [x] **Step 3: Keep render-model consumption aligned**

Verify:
- assistant text/reasoning rendering still comes only from text/reasoning events
- tool/approval/question cards still derive from runtime events
- draft-state rendering does not temporarily drop tool traces

- [x] **Step 4: Run the chat-focused regression tests**

Run: `node --test tests/ai/assistant-timeline-events.test.mjs tests/ai/ai-chat-store.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs tests/ai/agent-event-dispatch.test.mjs`

Expected: PASS

### Task 4: Mark the architecture report with execution status

**Files:**
- Modify: `docs/ai-architecture-cc-haha-comparison.html`

- [x] **Step 1: Add an execution-status note to the report**

Record:
- Event Plane V1 foundation completed in code
- what is now closed
- what still remains platform-level future work

- [x] **Step 2: Verify the report file still has no replacement-character corruption**

Run: `Select-String -LiteralPath 'docs/ai-architecture-cc-haha-comparison.html' -Pattern '\\uFFFD'`

Expected: no matches

### Task 5: Final verification

**Files:**
- Modify: `src/modules/ai/runtime/dispatch/agentEvents.ts`
- Modify: `src/modules/ai/store/assistantTimeline.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/assistantRenderModel.ts`
- Modify: `tests/ai/assistant-timeline-events.test.mjs`
- Modify: `tests/ai/agent-event-dispatch.test.mjs`
- Modify: `tests/ai/ai-chat-store.test.mjs`

- [x] **Step 1: Run the targeted Event Plane V1 test suite**

Run: `node --test tests/ai/assistant-timeline-events.test.mjs tests/ai/agent-event-dispatch.test.mjs tests/ai/ai-chat-store.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs`

Expected: PASS

- [x] **Step 2: Run a production sanity check**

Run: `npm run build`

Expected: PASS

- [x] **Step 3: Update the plan checkboxes to reflect what actually shipped**

Keep the plan honest: mark only completed steps complete.

---

## Master Rollout After Event Plane V1

This section extends the plan from the completed foundation slice into the full first-version platform rollout. Status values here are program status, not already-implemented claims.

### Phase 2: Session Event Log

**Status:** `done`

**Goal:** Make session persistence event-sourced so chat state, replay, restore, and multi-surface rendering all derive from one event log.

**Primary files to inspect or create:**
- Modify: `src/modules/ai/store/aiChatStore.ts`
- Modify: `src/modules/ai/runtime/replay/*`
- Modify: `src/modules/ai/runtime/session/*`
- Create or modify: event-log persistence helpers under `src/modules/ai/runtime/session/`

**What this phase should produce:**
- assistant timeline remains a message-level projection
- session-level event log becomes the source of truth
- restore and replay rebuild chat state from logged events
- one thread/session can be reopened without divergent state

**Current shipped slice:**
- `aiChatStore` sessions now persist an `eventLog`
- session mutations append events and rebuild the session projection
- legacy persisted sessions are normalized into an event log during migration
- message history and session metadata already derive from the logged session events
- replay events and recovery snapshots are now persisted into the session projection
- active session restore preloads persisted replay/recovery state before fetching the latest runtime replay history
- replay/recovery data from older persisted sessions is now migrated into `replay_state_synced` events instead of surviving only through fallback session fields
- duplicate replay snapshot syncs no longer append redundant `replay_state_synced` events into the session log
- active session restore now preloads skill state from the persisted replay recovery snapshot before the runtime replay fetch finishes

**Closed in this phase:**
- replay/recovery restore now comes from session event-log projection instead of relying on ad hoc persisted side fields
- session replay persistence no longer keeps appending the same snapshot on repeated runtime-store syncs
- replay-derived active skills are restored early enough that reopening the thread no longer waits on the runtime replay refetch to recover that surface

**Verification:**
- reload preserves mixed assistant text, tool, approval, and question state
- replay output matches reconstructed chat state
- targeted tests for rehydrate and replay pass

### Phase 3: Task / Run / AgentRun Model

**Status:** `done`

**Goal:** Introduce a proper execution hierarchy so background runs, multi-agent flows, and mailbox-style orchestration have stable IDs and parent-child boundaries.

**Primary files to inspect or create:**
- Modify: `src/modules/ai/runtime/session/agentSessionTypes.ts`
- Modify: `src/modules/ai/runtime/session/agentSessionStateMachine.ts`
- Modify: `src/modules/ai/runtime/teams/*`
- Modify: `src/modules/ai/runtime/orchestration/*`
- Create: run-model helpers under `src/modules/ai/runtime/dispatch/`
- Create: `src/modules/ai/runtime/execution/agentExecutionGraph.ts`
- Create: `src/modules/ai/platform-bridges/types.ts`

**What this phase should produce:**
- `Task`, `Run`, `AgentRun` identities and lifecycle
- parent-child event linking for local agent, team agent, and workflow runs
- background execution records that map cleanly into UI and persistence

**Current shipped slice:**
- `AgentExecutionTaskRecord`, `AgentExecutionRunRecord`, and `AgentExecutionAgentRunRecord` are now first-class runtime types
- `agentExecutionGraph.ts` owns stable ids, task/run status derivation, and workflow/team/local-agent parent-child graph helpers
- `agentRuntimeStore` now keeps thread-scoped `tasksByThread`, `runsByThread`, and `agentRunsByThread`
- `AIChat.tsx` now registers root turn runs plus workflow, local-agent, and team execution branches against the same execution model
- runtime task chips, execution timeline cards, checkpoints, and background tasks now refer back to stable run/task ids instead of ad hoc UI-only labels
- bridge-facing runtime contracts now have a dedicated `src/modules/ai/platform-bridges/types.ts` surface for thread/provider/run context

**Closed in this phase:**
- concurrent workflow/team/local-agent runs no longer share anonymous status blobs
- parent-child boundaries for execution branches are explicit and testable
- the comparison report and plan tracker can now mark execution hierarchy as shipped instead of planned

**Verification:**
- concurrent runs do not mix approvals, outputs, or tool traces
- team runs and workflow runs can be replayed independently
- targeted orchestration tests pass

### Phase 4: Skills / MCP / Memory Lifecycle

**Status:** `done`

**Goal:** Move skills, MCP tools, and memory lifecycle events onto a shared lifecycle so they behave like first-class runtime units instead of special cases.

**Primary files to inspect or create:**
- Modify: `src/modules/ai/runtime/skills/*`
- Modify: `src/modules/ai/runtime/mcp/*`
- Modify: `src/modules/ai/runtime/memory/*`
- Modify: `src/components/workspace/AIChat.tsx`

**What this phase should produce:**
- discover, load, activate, execute, persist, audit lifecycle
- MCP tool calls and skill invocations projected as standard runtime events
- memory reads, writes, and rollback visible in replay and recoverable from persistence

**Current shipped slice:**
- `src/modules/ai/runtime/dispatch/runtimeCapabilityLifecycle.ts` now owns shared lifecycle descriptors for runtime skill discovery/load/activation, skill hook execution, approval requested/approved/denied, MCP start/outcome, memory reads, memory writes, and memory rollback
- `src/modules/ai/skills/skillLibrary.ts` now exposes `loadRuntimeSkillCatalog()` so discovery results, successful loads, and merged registry state travel together instead of through separate ad hoc reads
- `AIChat.tsx` now projects runtime skill discovery/load with per-session dedupe, and explicit skill activation into assistant timeline tool events, runtime timeline events, persisted timeline events, and replay recovery state
- built-in runtime skill hooks now emit standard lifecycle tool events and replay audit events through the same timeline/recovery path as other runtime capabilities
- MCP turns now use the same lifecycle helper for start and outcome summaries instead of duplicating ad hoc summary assembly
- MCP start and completion/failure now append replay events through the recovery controller so restore/replay sees the same lifecycle path as chat UI
- runtime approval requests and approval decisions now append shared lifecycle timeline events and replay events through the same approval coordinator path used by MCP, built-in tools, and local-agent approval gates
- GN Agent memory save, overwrite, and rename actions now emit lifecycle timeline events, append replay events, and refresh recovery state/session replay projection
- AIChat now logs one shared memory-read lifecycle per turn before built-in, local-agent, and team execution branches consume project memory
- rewind now refreshes replay state from persistence and appends a standard memory-rollback lifecycle event into runtime timeline, persisted timeline, and replay recovery
- memory candidate extraction no longer treats assistant-only restatement as a durable fact source, reducing false positives before persistence

**Closed in this phase:**
- the current in-app runtime surfaces now share one lifecycle path for skills, MCP, approvals, memory writeback, memory reads, and rewind rollback
- Phase 4 no longer depends on bespoke per-feature timeline strings to explain capability state in chat, replay, and recovery
- the remaining deep audit gap is specifically the opaque tool/hook execution inside external local-agent processes, which belongs to the runtime-boundary/sidecar work in Phase 5 rather than blocking this phase closure

**Verification:**
- MCP/skills do not require bespoke chat rendering branches
- memory candidates and committed memory records can be replayed
- targeted UI and runtime tests pass
- `node --test tests/ai/runtime-capability-lifecycle.test.mjs tests/ai/runtime-mcp-flow.test.mjs tests/ai/agent-memory-writeback.test.mjs tests/ai/agent-runtime-skill-ui.test.mjs tests/ai/runtime-approval-coordinator.test.mjs tests/ai/chat-runtime-approval-coordinator-routing.test.mjs`
- `npm run build`

### Phase 5: Sidecar Boundary + Multi-Session Shell

**Status:** `done`

**Goal:** Separate presentation from execution more cleanly by introducing a runtime boundary and unifying multi-session shell behavior around it.

**Primary files to inspect or create:**
- Modify: `src/components/ai/gn-agent-shell/*`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/modules/ai/runtime/agentRuntimeClient.ts`
- Create: sidecar/event gateway contracts if the local boundary is introduced in-repo first

**What this phase should produce:**
- session registry and event gateway boundary
- one conversation model shared by embedded chat and agent shell
- reduced UI ownership of execution logic

**Current shipped slice:**
- `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts` now owns session reconciliation, active-session selection, and shared thread-id routing
- `src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts` now provides one project-aware conversation/runtime projection for embedded chat and GN shell
- `AIChat.tsx` now uses the shared gateway for active session, messages, tool state, replay recovery, live state, background task reads, and runtime-thread bootstrap reconciliation
- `GNAgentChatPage.tsx` now reads shared conversation/runtime state through the gateway instead of rebuilding it from scattered store subscriptions
- `GNAgentThreadList.tsx` and `GNAgentStatusPanel.tsx` are now prop-driven shell views for shared runtime state instead of owning duplicated subscriptions
- this phase intentionally ships an in-repo runtime boundary first, not a real external sidecar process yet

**Closed in this phase:**
- embedded chat and GN shell now render the same active conversation projection
- session switching, replay recovery access, approval counts, live state, and runtime thread reconciliation no longer depend on two separate UI-owned derivations
- the next runtime-boundary step is explicitly narrowed to true external sidecar / remote entry points, not more in-app state duplication

**Verification:**
- embedded chat and agent shell can render the same run consistently
- background/session switching does not lose tool or approval state
- build and targeted shell tests pass
- `node --test tests/ai/runtime-conversation-gateway.test.mjs tests/ai/agent-runtime-thread-ui.test.mjs tests/ai/gn-agent-chat-structure.test.mjs tests/ai/agent-runtime-timeline.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs tests/ai/ai-chat-write-recovery-source.test.mjs`
- `npm run build`

### Phase 6: Strategic Platform Scope

**Status:** `later`

**Goal:** Add the capabilities that make the system comparable to a full local AI platform once the core execution model is stable.

**Primary areas:**
- CLI / TUI / headless execution
- remote adapters
- computer use
- stronger provider proxying and observability

**Exit rule:**
- do not start this phase until Phases 2-5 are stable enough that new entry points will not multiply runtime inconsistency

## Completed Mapping

These items are already shipped by Event Plane V1 and should not be replanned:

- `src/modules/ai/runtime/dispatch/agentEvents.ts`: shared runtime-event upsert/map helpers for tool, approval, and question flows.
- `src/modules/ai/store/assistantTimeline.ts`: assistant timeline mutation helpers and streaming merge helpers.
- `src/components/workspace/AIChat.tsx`: runtime event writes now route through shared helpers; streaming drafts preserve runtime events.
- `tests/ai/assistant-timeline-events.test.mjs`: timeline helper and streaming-preservation coverage.
- `tests/ai/agent-event-dispatch.test.mjs`: shared runtime-event helper coverage.
- `tests/ai/ai-chat-store.test.mjs`: persisted assistant timeline coverage.
