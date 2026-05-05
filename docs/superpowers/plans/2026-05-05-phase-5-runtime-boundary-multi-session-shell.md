# Phase 5 Runtime Boundary + Multi-Session Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a shared runtime conversation gateway so embedded chat and GN shell consume one conversation/runtime projection instead of assembling runtime state independently.

**Architecture:** Add a pure runtime conversation gateway plus a shared hook under `src/modules/ai/runtime/conversation/`. Move session reconciliation and active conversation projection there first, then switch `AIChat` and GN shell surfaces to consume the shared gateway. Keep `agentRuntimeClient` as IO adapter and avoid inventing a real sidecar process in this phase.

**Tech Stack:** React 19, TypeScript, Zustand, Node test runner, existing AI runtime/replay/session helpers

---

### Task 1: Lock the gateway contract with failing tests

**Files:**
- Create: `tests/ai/runtime-conversation-gateway.test.mjs`
- Modify: `tests/ai/agent-runtime-thread-ui.test.mjs`
- Modify: `tests/ai/gn-agent-chat-structure.test.mjs`
- Test: `tests/ai/runtime-conversation-gateway.test.mjs`

- [x] **Step 1: Add pure helper expectations for session reconciliation and projection**

Cover:
- runtime threads reconcile into chat sessions without duplicating existing sessions
- active session resolution prefers explicit active id, then first session
- projection exposes approval/checkpoint/task/live thread ids consistently

- [x] **Step 2: Add source assertions for gateway adoption**

Cover:
- `AIChat.tsx` references `useRuntimeConversationGateway`
- `GNAgentChatPage.tsx` references `useRuntimeConversationGateway`
- `GNAgentThreadList.tsx` and `GNAgentStatusPanel.tsx` move toward prop-driven shell rendering

- [x] **Step 3: Run the focused test set and confirm red**

Run: `node --test tests/ai/runtime-conversation-gateway.test.mjs tests/ai/agent-runtime-thread-ui.test.mjs tests/ai/gn-agent-chat-structure.test.mjs`

Expected: FAIL on missing gateway module and missing gateway wiring.

### Task 2: Build the runtime conversation gateway foundation

**Files:**
- Create: `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
- Create: `src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts`
- Test: `tests/ai/runtime-conversation-gateway.test.mjs`

- [x] **Step 1: Implement pure session reconciliation helpers**

Implement:
- normalize runtime-thread-backed sessions
- reconcile persisted runtime threads with chat sessions
- resolve active session id

- [x] **Step 2: Implement shared runtime conversation projection builder**

Implement:
- one builder that merges chat session state, runtime store state, approval store state, and MCP state
- explicit `approvalThreadId`, `checkpointThreadId`, `taskThreadId`, and `liveThreadId`

- [x] **Step 3: Implement the shared gateway hook**

Implement:
- current project aware gateway hook
- shared selector-based read path for active conversation runtime state

- [x] **Step 4: Run the focused gateway test**

Run: `node --test tests/ai/runtime-conversation-gateway.test.mjs`

Expected: PASS

### Task 3: Move AIChat bootstrap and projection reads onto the gateway

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
- Test: `tests/ai/agent-runtime-thread-ui.test.mjs`

- [x] **Step 1: Replace local active-session derivation with gateway projection**

Touch:
- active session/session list resolution
- active thread id derivation
- latest turn session / replay resume / live state / background tasks reads

- [x] **Step 2: Replace runtime-thread bootstrap reconciliation with shared helper**

Touch:
- persisted runtime thread load
- session creation/binding reconciliation
- active-session fallback handling

- [x] **Step 3: Keep turn submission/orchestration behavior unchanged**

Rules:
- do not move actual turn execution logic out of `AIChat.tsx` in this phase
- only move bootstrap/projection concerns

- [x] **Step 4: Run targeted source tests**

Run: `node --test tests/ai/agent-runtime-thread-ui.test.mjs tests/ai/ai-chat-write-recovery-source.test.mjs`

Expected: PASS

### Task 4: Move GN shell surfaces onto the shared gateway

**Files:**
- Modify: `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentThreadList.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentStatusPanel.tsx`
- Modify: `src/modules/ai/gn-agent/gnAgentShellStore.ts`
- Test: `tests/ai/gn-agent-chat-structure.test.mjs`
- Test: `tests/ai/agent-runtime-thread-ui.test.mjs`

- [x] **Step 1: Centralize shell runtime reads in `GNAgentChatPage.tsx`**

Touch:
- active session
- latest turn session
- context snapshot
- tool calls / MCP calls
- memory candidates / memory entries
- live state / approvals / activity summary

- [x] **Step 2: Convert shell panels to prop-driven views**

Touch:
- `GNAgentThreadList.tsx`
- `GNAgentStatusPanel.tsx`

Rules:
- they may keep tiny action callbacks
- they should stop opening their own project/session/runtime store subscriptions for shared runtime state

- [x] **Step 3: Extend shell store only for shell-local UX**

Keep:
- provider tab / local config binding / shell-local mode

Avoid:
- duplicating runtime session state into shell store

- [x] **Step 4: Run shell-focused tests**

Run: `node --test tests/ai/agent-runtime-thread-ui.test.mjs tests/ai/gn-agent-chat-structure.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs`

Expected: PASS

### Task 5: Update architecture artifacts and verify the phase

**Files:**
- Modify: `docs/superpowers/plans/2026-05-05-event-plane-v1-implementation.md`
- Modify: `docs/ai-architecture-cc-haha-comparison.html`
- Test: `tests/ai/runtime-conversation-gateway.test.mjs`
- Test: `tests/ai/agent-runtime-thread-ui.test.mjs`
- Test: `tests/ai/gn-agent-chat-structure.test.mjs`

- [x] **Step 1: Mark Phase 5 with shipped scope, not aspiration**

Record:
- runtime conversation gateway shipped
- AIChat + GN shell now share one conversation/runtime projection
- remaining real-sidecar / remote work moved later

- [x] **Step 2: Run Phase 5 verification suite**

Run: `node --test tests/ai/runtime-conversation-gateway.test.mjs tests/ai/agent-runtime-thread-ui.test.mjs tests/ai/gn-agent-chat-structure.test.mjs tests/ai/agent-runtime-timeline.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs tests/ai/ai-chat-write-recovery-source.test.mjs`

Expected: PASS

- [x] **Step 3: Run production sanity check**

Run: `npm run build`

Expected: PASS
