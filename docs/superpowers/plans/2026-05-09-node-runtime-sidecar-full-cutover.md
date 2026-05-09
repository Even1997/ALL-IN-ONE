# Node Runtime Sidecar Full Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current front-end-owned runtime with a Node.js sidecar runtime in one cutover release so the desktop UI becomes a protocol subscriber instead of the runtime host.

**Architecture:** Reorganize the repo into `apps/desktop`, `apps/runtime`, and shared `packages/*`. Move AI execution, tool orchestration, MCP, replay, approvals, and session projection into a local Node.js runtime server that exposes a versioned local HTTP + WebSocket protocol. Tauri becomes a shell that launches the sidecar and provides native capabilities only. React consumes snapshots and events through a runtime client and renders projection state.

**Tech Stack:** React 19, TypeScript, Tauri 2, Node.js sidecar, SQLite, WebSocket, HTTP, existing runtime modules migrated into shared runtime packages.

---

## Success Criteria

1. `AIChat.tsx` and agent shell pages no longer import runtime execution internals.
2. The runtime sidecar owns turn execution, tool loop, replay, approvals, MCP, and persistence.
3. Tauri Rust no longer stores runtime JSON state or exposes runtime business commands.
4. Desktop UI talks only through the shared runtime protocol client.
5. Existing session history and runtime artifacts are migrated into sidecar persistence.
6. The app ships as a single cutover release without dual-runtime production mode.

## Target Repository Shape

```text
apps/
  desktop/
    src/
    src-tauri/
  runtime/
    src/
packages/
  runtime-protocol/
  runtime-client/
  runtime-core/
```

## Workstream A: Repository Restructure And Shared Packages

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/runtime/package.json`
- Create: `packages/runtime-protocol/package.json`
- Create: `packages/runtime-client/package.json`
- Create: `packages/runtime-core/package.json`
- Create: `pnpm-workspace.yaml` or workspace config in root `package.json`
- Modify: root `package.json`

- [ ] **Step 1: Convert the repo to a workspace layout**

Verify:
- root workspace install succeeds
- desktop and runtime can be built independently

- [ ] **Step 2: Move the current Vite/Tauri app into `apps/desktop/`**

Verify:
- desktop build path and Tauri config still resolve

- [ ] **Step 3: Create shared package boundaries**

Verify:
- `packages/runtime-protocol` exports command/event types
- `packages/runtime-core` exports runtime logic without React or Tauri imports
- `packages/runtime-client` exports browser-safe client APIs

## Workstream B: Node Runtime Sidecar

**Files:**
- Create: `apps/runtime/src/index.ts`
- Create: `apps/runtime/src/server/httpServer.ts`
- Create: `apps/runtime/src/server/wsHub.ts`
- Create: `apps/runtime/src/server/auth.ts`
- Create: `apps/runtime/src/store/sqlite.ts`
- Create: `apps/runtime/src/store/migrations/*.sql`
- Create: `apps/runtime/src/application/*.ts`
- Create: `apps/runtime/src/domain/**/*`
- Create: `apps/runtime/src/projection/*.ts`

- [ ] **Step 1: Stand up a local HTTP + WebSocket runtime server**

Verify:
- `GET /health` returns `ok`
- authenticated WebSocket clients can connect and receive `runtime.ready`

- [ ] **Step 2: Implement session and thread APIs**

Commands:
- `session.create`
- `session.list`
- `session.open`

Verify:
- sessions can be created, listed, reopened, and projected from SQLite

- [ ] **Step 3: Move turn coordinator and model execution into the sidecar**

Sources to migrate:
- `src/modules/ai/core/AIService.ts`
- `src/modules/ai/runtime/orchestration/*`
- `src/modules/ai/runtime/tools/*`
- `src/modules/ai/runtime/context/*`
- `src/modules/ai/runtime/execution/*`

Verify:
- `turn.submit` triggers server-side execution and emits deltas over WebSocket

- [ ] **Step 4: Move approvals, MCP, replay, and checkpoints into the sidecar**

Verify:
- approvals survive reconnect
- replay and rewind operate from sidecar persistence
- MCP server CRUD and invocation are sidecar-owned

## Workstream C: Desktop Runtime Client And UI Cutover

**Files:**
- Create: `packages/runtime-client/src/index.ts`
- Create: `packages/runtime-client/src/wsClient.ts`
- Create: `packages/runtime-client/src/httpClient.ts`
- Modify: `apps/desktop/src/components/workspace/AIChat.tsx`
- Modify: `apps/desktop/src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts`
- Modify: `apps/desktop/src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
- Modify: `apps/desktop/src/features/agent-shell/**/*`
- Modify: desktop Zustand stores that currently act as runtime truth

- [ ] **Step 1: Replace direct runtime execution calls with protocol commands**

Verify:
- UI uses `runtime-client` for submit/approve/answer/rewind
- no direct execution import remains in `AIChat.tsx`

- [ ] **Step 2: Convert runtime stores into projection caches**

Verify:
- UI stores only hold snapshots, draft input, and view state
- no UI store is treated as the runtime source of truth

- [ ] **Step 3: Rebuild the runtime conversation gateway around sidecar snapshots**

Verify:
- session switch and reconnect consume sidecar snapshots instead of local store assembly

## Workstream D: Tauri Shell Simplification

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Delete: `apps/desktop/src-tauri/src/agent_runtime/*`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Create: sidecar launch and health-check module in `src-tauri/src/`

- [ ] **Step 1: Replace runtime business commands with sidecar lifecycle commands**

Keep only:
- start sidecar
- stop sidecar
- health check
- app path resolution
- native shell/dialog helpers

- [ ] **Step 2: Bundle the Node sidecar with the desktop app**

Verify:
- dev build launches sidecar
- packaged app launches sidecar on macOS and Windows

- [ ] **Step 3: Remove Rust JSON runtime stores**

Verify:
- no runtime session, approval, replay, MCP, or checkpoint state is persisted by Rust

## Workstream E: Data Migration

**Files:**
- Create: `apps/runtime/src/store/migrateFromLegacyDesktop.ts`
- Create: `apps/runtime/src/store/legacyReaders/*`
- Modify: desktop bootstrap path to trigger one-time migration

- [ ] **Step 1: Read current persisted sessions and runtime artifacts**

Sources:
- existing desktop session state
- runtime replay records
- approval records
- MCP settings
- project memory

- [ ] **Step 2: Write all legacy state into sidecar SQLite**

Verify:
- existing sessions reopen with message history and runtime artifacts intact

- [ ] **Step 3: Mark migration completion and disable legacy readers**

Verify:
- second boot does not rerun migration

## Workstream F: Testing And Release Gate

**Files:**
- Create: `tests/runtime-protocol/*.test.mjs`
- Create: `tests/runtime-sidecar/*.test.mjs`
- Modify: desktop architecture tests
- Modify: build/test scripts

- [ ] **Step 1: Add protocol contract tests**

Verify:
- command and event payloads validate against schemas

- [ ] **Step 2: Add sidecar integration tests**

Verify:
- submit turn
- stream tool events
- approval roundtrip
- replay/rewind
- reconnect recovery

- [ ] **Step 3: Add desktop boundary tests**

Verify:
- `AIChat.tsx` does not import runtime execution internals
- desktop pages subscribe through `runtime-client` and gateway only

- [ ] **Step 4: Run the full cutover verification**

Run:
- workspace install
- runtime tests
- desktop tests
- desktop build
- sidecar package build
- Tauri desktop build

Expected:
- all PASS

## Final Cutover Rule

This migration is considered complete only when the old front-end-owned runtime path is fully removed from the shipping tree. A branch that merely adds the sidecar beside the current runtime is not done.
