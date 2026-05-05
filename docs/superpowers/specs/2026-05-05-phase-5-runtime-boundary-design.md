# Phase 5 Runtime Boundary + Multi-Session Shell Design

**Date:** 2026-05-05

**Status:** Approved for implementation

## Goal

Turn the current in-app AI runtime into a cleaner two-layer shape:

1. a shared runtime conversation gateway that owns conversation/runtime projection and hydrate behavior
2. presentation shells such as `AIChat` and `GNAgentChatPage` that consume the same projection instead of assembling runtime state independently

This phase does not introduce a real external sidecar process yet. It establishes the in-repo boundary in the same shape that a future sidecar can adopt without redoing the event model again.

## Current Problems

- `AIChat.tsx` owns both presentation and runtime orchestration glue. It bootstraps sessions, loads runtime threads, hydrates approvals/replay/background tasks, derives active thread ids, and renders UI.
- `GNAgentChatPage.tsx` reads from `useAIChatStore`, `useAgentRuntimeStore`, `useRuntimeMcpStore`, and replay helpers directly, which recreates a second partial runtime shell beside `AIChat`.
- GN shell panels such as thread/status views read stores directly instead of receiving a stable conversation projection from one owner.
- The system already has a solid event plane, session event log, execution graph, and lifecycle descriptors, but the boundary between control-plane/runtime state and presentation is still too UI-adjacent.

## Target Design

### 1. Runtime Conversation Gateway

Create a shared runtime conversation gateway layer under `src/modules/ai/runtime/conversation/`.

Responsibilities:

- reconcile persisted runtime threads with chat sessions
- resolve the active conversation/session for a project
- build a stable runtime conversation projection from:
  - `useAIChatStore`
  - `useAgentRuntimeStore`
  - `useApprovalStore`
  - `useRuntimeMcpStore`
- expose helpers for:
  - session bootstrap
  - active conversation selection
  - replay/recovery/task hydrate side effects

This layer is the new local runtime boundary.

### 2. Shared Conversation Projection

The gateway should produce one shared projection for the active conversation, including:

- sessions and active session
- runtime thread ids for approval/checkpoint/task/replay/live views
- messages and activity entries
- latest turn session
- replay resume request and recovery state
- live runtime state
- tool calls, MCP tool calls, memory candidates, memory entries
- approvals and pending approval count
- background tasks and team runs
- active skills and context snapshot

Both embedded chat and GN shell should consume this projection.

### 3. Multi-Session Shell Ownership

`GNAgentChatPage` becomes a shell over the shared conversation gateway instead of a second runtime state assembler.

Changes:

- centralize shell runtime reads in `GNAgentChatPage`
- pass data into `GNAgentThreadList`, `GNAgentStatusPanel`, and other shell panels as props
- stop letting shell panels open their own store subscriptions for project/session/runtime state when the page already owns the active conversation projection

### 4. Presentation Boundaries

After this phase:

- `agentRuntimeClient.ts` stays as IO adapter / runtime client
- the gateway owns conversation/runtime projection
- `AIChat.tsx` keeps turn submission/execution orchestration, but stops owning bootstrap/hydrate/session derivation details directly
- `GNAgentChatPage.tsx` becomes a presentation shell and memory-action host over the shared projection

## Non-Goals

- no real standalone sidecar process yet
- no CLI/TUI/headless entry point yet
- no remote adapters or computer use
- no provider capability normalization beyond what Phase 5 needs

## Files and Responsibilities

### New

- `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
  - pure helpers for session reconciliation and runtime conversation projection
- `src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts`
  - shared hook for active project/session/runtime projection

### Modified

- `src/components/workspace/AIChat.tsx`
  - consume shared gateway for bootstrap/session/projection reads
- `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
  - consume shared gateway and pass shell view props downward
- `src/components/ai/gn-agent-shell/GNAgentThreadList.tsx`
  - become prop-driven shell view
- `src/components/ai/gn-agent-shell/GNAgentStatusPanel.tsx`
  - become prop-driven shell view
- `src/modules/ai/gn-agent/gnAgentShellStore.ts`
  - extend shell state only if needed for stable shell-level provider/session UX
- `docs/superpowers/plans/2026-05-05-event-plane-v1-implementation.md`
  - mark Phase 5 honestly
- `docs/ai-architecture-cc-haha-comparison.html`
  - update architecture report and plan tracker

## Testing Strategy

### Pure gateway tests

Add tests for:

- runtime-thread to chat-session reconciliation
- active conversation resolution
- runtime conversation projection building
- stable thread-id routing for approval/checkpoint/task/live/replay surfaces

### Source wiring tests

Add or update tests to ensure:

- `AIChat.tsx` imports and uses the runtime conversation gateway
- `GNAgentChatPage.tsx` imports and uses the runtime conversation gateway
- `GNAgentThreadList.tsx` and `GNAgentStatusPanel.tsx` become prop-driven instead of directly reading multiple stores

### Regression checks

- embedded AI panel and GN shell render the same active session/run state
- session switching preserves tool, approval, replay, and recovery state
- build still passes

## Success Criteria

Phase 5 is done when:

- one shared runtime conversation gateway exists and is used by both `AIChat` and GN shell
- shell panels stop assembling their own runtime state independently
- active conversation selection and hydrate logic no longer live only inside `AIChat.tsx`
- the architecture report can honestly mark Phase 5 as done and move the remaining future-sidecar work to Phase 6+
